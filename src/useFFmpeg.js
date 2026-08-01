import { useCallback, useRef, useState } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// Pinned core version that matches @ffmpeg/ffmpeg 0.12.x.
// NOTE: @ffmpeg/ffmpeg spawns a *module* Web Worker, so it loads the core via
// dynamic `import()` — which requires the ESM build (the UMD build has no
// default export and fails with "failed to import ffmpeg-core.js").
const CORE_VERSION = '0.12.6'
const BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

// Quality presets -> H.264 CRF (lower = better quality, bigger file)
export const QUALITY = {
  high: { crf: 20, label: 'High quality (larger file)' },
  balanced: { crf: 26, label: 'Balanced (recommended)' },
  small: { crf: 32, label: 'Small size (lower quality)' },
}

// Target resolutions for normalization/downscale
export const RESOLUTION = {
  source: { height: null, label: 'Keep source resolution' },
  '1080': { height: 1080, label: '1080p' },
  '720': { height: 720, label: '720p' },
  '480': { height: 480, label: '480p' },
}

export const FORMAT = {
  mp4: { ext: 'mp4', mime: 'video/mp4', label: 'MP4 (H.264) — best compatibility' },
  webm: { ext: 'webm', mime: 'video/webm', label: 'WebM (VP8) — open format' },
}

// Rough per-resolution baseline video bitrate (bits/s) used for WebM quality mode.
const WEBM_BASE_BPS = { 480: 1_000_000, 720: 2_500_000, 1080: 4_500_000 }
const WEBM_QUALITY_FACTOR = { high: 1.5, balanced: 1.0, small: 0.6 }

const CANCELLED = 'CANCELLED'

const parseTimeToSeconds = (line) => {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])
}

export function useFFmpeg() {
  const ffmpegRef = useRef(null)
  const logRef = useRef([]) // rolling ffmpeg log lines
  const cancelRef = useRef(false)
  const timerRef = useRef(null)

  // Progress bookkeeping (mutated by the log handler, mirrored into state)
  const workRef = useRef({ total: 1, done: 0, stageWork: 0, stageDur: 1 })
  const overallRef = useRef(0)
  const startRef = useRef(0)

  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [eta, setEta] = useState(null)

  const setOverallFromStage = useCallback((frac) => {
    const w = workRef.current
    const overall = Math.min(
      99.5,
      ((w.done + w.stageWork * Math.min(1, Math.max(0, frac))) / w.total) * 100
    )
    if (overall > overallRef.current) {
      overallRef.current = overall
      setProgress(Math.round(overall))
    }
  }, [])

  const load = useCallback(async () => {
    if (ffmpegRef.current) return ffmpegRef.current
    setLoading(true)
    setStatus('Loading FFmpeg core (~30 MB, first time only)…')
    try {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('log', ({ message }) => {
        logRef.current.push(message)
        if (logRef.current.length > 400) logRef.current.shift()
        const t = parseTimeToSeconds(message)
        if (t != null && workRef.current.stageDur > 0) {
          setOverallFromStage(t / workRef.current.stageDur)
        }
      })
      await ffmpeg.load({
        coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpegRef.current = ffmpeg
      setLoaded(true)
      setStatus('')
      return ffmpeg
    } finally {
      // Always clear the loading flag, even if the core failed to load,
      // so the UI never gets stuck in a busy state.
      setLoading(false)
    }
  }, [setOverallFromStage])

  const cancel = useCallback(() => {
    cancelRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    try {
      ffmpegRef.current?.terminate()
    } catch {
      /* ignore */
    }
    ffmpegRef.current = null
    setLoaded(false)
    setRunning(false)
    setStatus('Cancelled')
  }, [])

  const checkCancel = () => {
    if (cancelRef.current) throw new Error(CANCELLED)
  }

  // Fast header read to detect whether a clip has an audio stream.
  const probeHasAudio = async (ffmpeg, name) => {
    const before = logRef.current.length
    try {
      // No output file -> ffmpeg exits non-zero but prints stream info.
      await ffmpeg.exec(['-i', name])
    } catch {
      /* expected */
    }
    const lines = logRef.current.slice(before)
    return lines.some((l) => /Stream #.*Audio/i.test(l))
  }

  const scaleFilter = (h) =>
    h ? `scale=-2:'min(${h},ih)'` : `scale=trunc(iw/2)*2:trunc(ih/2)*2`

  const process = useCallback(
    async (clips, opts) => {
      const {
        crf,
        targetHeight,
        format, // 'mp4' | 'webm'
        mute, // boolean
        mode, // 'quality' | 'size'
        targetMB, // number (size mode)
      } = opts

      cancelRef.current = false
      overallRef.current = 0
      setProgress(0)
      setElapsed(0)
      setEta(null)
      setRunning(true)
      startRef.current = Date.now()

      // Trimmed duration per clip
      const durs = clips.map((c) =>
        Math.max(0.05, (c.end ?? c.duration) - (c.start ?? 0))
      )
      const totalDur = durs.reduce((a, b) => a + b, 0)

      // A second encode pass is needed for WebM output or target-size mode.
      const needsFinalPass = format === 'webm' || mode === 'size'
      const normCrf = needsFinalPass ? 18 : crf // mezzanine vs final

      // Build the work plan (units ~= seconds of video processed) for the ETA.
      const w = workRef.current
      w.total =
        totalDur + // normalize
        0.03 * totalDur + // concat (copy, cheap)
        (needsFinalPass ? totalDur * (format === 'webm' ? 1.6 : 1) : 0)
      w.done = 0

      const intermediates = []

      try {
        // Live elapsed + ETA ticker (inside try so finally always clears it)
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
          const secs = (Date.now() - startRef.current) / 1000
          setElapsed(secs)
          const o = overallRef.current
          setEta(o > 1 ? (secs * (100 - o)) / o : null)
        }, 500)

        const ffmpeg = await load()

        // 1) Normalize each clip (trim + scale + common codec) -> .ts
        for (let i = 0; i < clips.length; i++) {
          checkCancel()
          setStatus(`Preparing clip ${i + 1} of ${clips.length}…`)
          const inName = `in_${i}`
          const outName = `norm_${i}.ts`
          const dur = durs[i]
          w.stageWork = dur
          w.stageDur = dur

          await ffmpeg.writeFile(inName, await fetchFile(clips[i].file))
          const hasAudio = mute ? false : await probeHasAudio(ffmpeg, inName)
          checkCancel()

          const args = ['-ss', String(clips[i].start ?? 0), '-i', inName]
          if (!mute && !hasAudio) {
            args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
          }
          args.push('-t', String(dur))
          const c = clips[i].crop
          const cropVf =
            c && c.w < 0.999
              ? `crop=${c.w}*in_w:${c.h}*in_h:${c.x}*in_w:${c.y}*in_h,`
              : ''
          // Rotation (degrees clockwise). transpose=1 -> 90° CW, transpose=2 -> 90° CCW.
          // Applied after crop (crop coords are on the source frame) and before scale.
          const rot = ((clips[i].rotate || 0) % 360 + 360) % 360
          const rotateVf =
            rot === 90
              ? 'transpose=1,'
              : rot === 180
                ? 'transpose=1,transpose=1,'
                : rot === 270
                  ? 'transpose=2,'
                  : ''
          args.push('-vf', `${cropVf}${rotateVf}${scaleFilter(targetHeight)},fps=30,format=yuv420p`)
          args.push('-map', '0:v:0')
          if (!mute) {
            args.push('-map', hasAudio ? '0:a:0' : '1:a:0')
            if (!hasAudio) args.push('-shortest')
          }
          args.push('-c:v', 'libx264', '-crf', String(normCrf), '-preset', 'veryfast')
          if (mute) args.push('-an')
          else args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100')
          args.push('-f', 'mpegts', outName)

          await ffmpeg.exec(args)
          await ffmpeg.deleteFile(inName)
          intermediates.push(outName)
          w.done += w.stageWork
          setOverallFromStage(0)
        }

        // 2) Concat normalized segments (stream copy — fast, lossless here)
        checkCancel()
        setStatus('Merging clips…')
        w.stageWork = 0.03 * totalDur
        w.stageDur = totalDur
        const mergedName = needsFinalPass ? 'merged.ts' : `output.${FORMAT[format].ext}`
        await ffmpeg.exec([
          '-i', `concat:${intermediates.join('|')}`,
          '-c', 'copy',
          '-movflags', '+faststart',
          mergedName,
        ])
        for (const f of intermediates) await ffmpeg.deleteFile(f)
        w.done += w.stageWork

        // 3) Final encode pass (only for WebM or target-size)
        let finalName = mergedName
        if (needsFinalPass) {
          checkCancel()
          finalName = `output.${FORMAT[format].ext}`
          w.stageWork = totalDur * (format === 'webm' ? 1.6 : 1)
          w.stageDur = totalDur

          // Bitrate for size mode
          let videoBps = null
          if (mode === 'size') {
            const totalBits = targetMB * 8 * 1024 * 1024
            const audioBits = mute ? 0 : 128_000 * totalDur
            videoBps = Math.max(50_000, Math.round((totalBits - audioBits) / totalDur))
          }

          const args = ['-i', mergedName]
          if (format === 'webm') {
            setStatus('Encoding WebM (VP8)…')
            const bps =
              mode === 'size'
                ? videoBps
                : Math.round(
                    (WEBM_BASE_BPS[targetHeight || 1080] || WEBM_BASE_BPS[1080]) *
                      (WEBM_QUALITY_FACTOR[
                        crf <= 20 ? 'high' : crf <= 26 ? 'balanced' : 'small'
                      ] || 1)
                  )
            args.push('-c:v', 'libvpx', '-b:v', String(bps), '-deadline', 'realtime', '-cpu-used', '5')
            args.push(mute ? '-an' : '-c:a', ...(mute ? [] : ['libopus', '-b:a', '128k']))
          } else {
            setStatus('Compressing to target size…')
            args.push('-c:v', 'libx264', '-preset', 'veryfast')
            args.push('-b:v', String(videoBps), '-maxrate', String(videoBps), '-bufsize', String(videoBps * 2))
            args.push('-movflags', '+faststart')
            args.push(mute ? '-an' : '-c:a', ...(mute ? [] : ['aac', '-b:a', '128k']))
          }
          args.push(finalName)
          await ffmpeg.exec(args)
          await ffmpeg.deleteFile(mergedName)
          w.done += w.stageWork
        }

        checkCancel()
        const data = await ffmpeg.readFile(finalName)
        await ffmpeg.deleteFile(finalName)

        overallRef.current = 100
        setProgress(100)
        setStatus('Done')
        return new Blob([data.buffer], { type: FORMAT[format].mime })
      } finally {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        setRunning(false)
      }
    },
    [load, setOverallFromStage]
  )

  return {
    load,
    process,
    cancel,
    loaded,
    loading,
    running,
    progress,
    status,
    elapsed,
    eta,
    isCancelledError: (e) => e?.message === CANCELLED,
  }
}
