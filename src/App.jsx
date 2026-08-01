import { useEffect, useMemo, useRef, useState } from 'react'
import { useFFmpeg, QUALITY, RESOLUTION, FORMAT } from './useFFmpeg.js'
import PdfCompressor from './PdfCompressor.jsx'
import ImageCompressor from './ImageCompressor.jsx'

const BRAND = 'Sanrovix Tech'

const TOOLS = [
  { id: 'video', label: 'Video Editor', icon: '🎬', title: 'Merge, Cut, Crop & Compress', sub: 'A premium in-browser video studio. 100% private — nothing is ever uploaded.' },
  { id: 'pdf', label: 'PDF Compressor', icon: '📄', title: 'Compress PDF', sub: 'Shrink PDF files right in your browser. 100% private — nothing is ever uploaded.' },
  { id: 'image', label: 'Image Compressor', icon: '🖼️', title: 'Compress Images', sub: 'Optimize JPG, PNG & WebP locally. 100% private — nothing is ever uploaded.' },
]

// Rotating quotes about video, files & the craft of technology.
const QUOTES = [
  { t: 'The best camera is the one that’s with you.', a: 'Chase Jarvis' },
  { t: 'Any sufficiently advanced technology is indistinguishable from magic.', a: 'Arthur C. Clarke' },
  { t: 'Compression is the art of throwing away what the eye will never miss.', a: 'Sanrovix Tech' },
  { t: 'Content is fire; social media is gasoline.', a: 'Jay Baer' },
  { t: 'Simplicity is the ultimate sophistication.', a: 'Leonardo da Vinci' },
  { t: 'A single video can say what a thousand files never will.', a: 'Sanrovix Tech' },
  { t: 'First, solve the problem. Then, write the code.', a: 'John Johnson' },
  { t: 'The details are not the details. They make the design.', a: 'Charles Eames' },
  { t: 'Make it work, make it right, make it fast.', a: 'Kent Beck' },
  { t: 'Great software feels invisible — it just gets out of your way.', a: 'Sanrovix Tech' },
]

// Pull a fresh batch of quotes from the internet, with graceful fallbacks.
async function fetchQuotes() {
  // Primary: dummyjson live API (CORS + CORP friendly). Random page each call.
  try {
    const skip = Math.floor(Math.random() * 1400)
    const r = await fetch(`https://dummyjson.com/quotes?limit=25&skip=${skip}`)
    if (r.ok) {
      const j = await r.json()
      const list = (j.quotes || [])
        .map((q) => ({ t: q.quote, a: q.author }))
        .filter((x) => x.t && x.t.length >= 20 && x.t.length <= 130)
      if (list.length) return list
    }
  } catch {
    /* fall through */
  }
  // Fallback: large static dataset on jsDelivr CDN.
  try {
    const r = await fetch('https://cdn.jsdelivr.net/gh/dwyl/quotes@main/quotes.json')
    if (r.ok) {
      const j = await r.json()
      const arr = Array.isArray(j) ? j : j.quotes || []
      const list = arr
        .map((q) => ({ t: q.text || q.quote, a: q.author }))
        .filter((x) => x.t && x.t.length >= 20 && x.t.length <= 130)
      // shuffle a little so it's different each load
      for (let i = list.length - 1; i > 0; i--) {
        const k = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[k]] = [list[k], list[i]]
      }
      if (list.length) return list.slice(0, 60)
    }
  } catch {
    /* fall through */
  }
  return null
}

function QuoteAside() {
  const [quotes, setQuotes] = useState(QUOTES)
  const [i, setI] = useState(0)
  const [show, setShow] = useState(true)

  // Load fresh quotes from the internet on mount, then refresh periodically.
  useEffect(() => {
    let alive = true
    const load = async () => {
      const fresh = await fetchQuotes()
      if (alive && fresh && fresh.length) {
        setQuotes(fresh)
        setI(0)
      }
    }
    load()
    const refresh = setInterval(load, 120000) // pull new ones every 2 min
    return () => {
      alive = false
      clearInterval(refresh)
    }
  }, [])

  // Rotate the visible quote with a fade.
  useEffect(() => {
    const id = setInterval(() => {
      setShow(false)
      setTimeout(() => {
        setI((n) => (n + 1) % quotes.length)
        setShow(true)
      }, 400)
    }, 6500)
    return () => clearInterval(id)
  }, [quotes.length])

  const q = quotes[i % quotes.length] || quotes[0]

  return (
    <aside className="aside">
      <div className="aside-card quote-card">
        <span className="quote-eyebrow">Daily Inspiration</span>
        <span className="quote-mark">“</span>
        <div className={`quote ${show ? 'in' : 'out'}`}>
          <p className="quote-text">{q.t}</p>
        </div>
      </div>

      <div className="aside-card grow feature-card">
        <h3 className="aside-title">Why {BRAND} Studio</h3>
        <ul className="feature-list">
          <li><span>🔒</span> 100% on-device — files never leave your browser</li>
          <li><span>🎬</span> Video: merge, cut, crop &amp; compress</li>
          <li><span>📄</span> PDF &amp; image compression built in</li>
          <li><span>🚀</span> No sign-up, no watermarks — instant export</li>
        </ul>

        <div className="aside-spotlight">
          <div className="spotlight-badge">🛡️</div>
          <p className="spotlight-text">
            Private by design — every file is processed right here on your device.
          </p>
          <div className="format-chips">
            {['MP4', 'MOV', 'WebM', 'PDF', 'JPG', 'PNG', 'WebP'].map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

function formatTime(secs) {
  if (secs == null || !isFinite(secs)) return '—'
  const s = Math.max(0, Math.round(secs))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

let clipId = 0

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Modal: play a clip, cut it (set in/out points on a timeline), and optionally
// crop it. Crop is stored as fractions (0..1) of the frame; trim as seconds.
function ClipEditor({ clip, onClose, onSave }) {
  const duration = clip.duration || 0
  const [enabled, setEnabled] = useState(!!clip.crop)
  const [crop, setCrop] = useState(clip.crop || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [start, setStart] = useState(clip.start ?? 0)
  const [end, setEnd] = useState(clip.end ?? duration)
  const [current, setCurrent] = useState(clip.start ?? 0)
  const [playing, setPlaying] = useState(false)
  // Rotation applied on export, in degrees clockwise: 0 | 90 | 180 | 270.
  const [rotate, setRotate] = useState(clip.rotate || 0)
  const rotateBy = (deg) => setRotate((r) => (((r + deg) % 360) + 360) % 360)

  const boxRef = useRef(null)
  const trackRef = useRef(null)
  const videoRef = useRef(null)
  const drag = useRef(null)
  // Keep latest trim bounds available to the timeupdate handler without stale closures.
  const bounds = useRef({ start, end })
  bounds.current = { start, end }

  // ---- Crop box drag ----
  const beginCrop = (e, mode) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = boxRef.current.getBoundingClientRect()
    drag.current = { kind: 'crop', mode, rect, sx: e.clientX, sy: e.clientY, orig: { ...crop } }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
  }

  // ---- Trim handle drag ----
  const beginTrim = (e, which) => {
    e.preventDefault()
    e.stopPropagation()
    drag.current = { kind: 'trim', which, rect: trackRef.current.getBoundingClientRect() }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
  }

  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'crop') {
      const dx = (e.clientX - d.sx) / d.rect.width
      const dy = (e.clientY - d.sy) / d.rect.height
      let { x, y, w, h } = d.orig
      if (d.mode === 'move') {
        x = clamp(x + dx, 0, 1 - w)
        y = clamp(y + dy, 0, 1 - h)
      } else {
        if (d.mode.includes('e')) w = clamp(w + dx, 0.05, 1 - x)
        if (d.mode.includes('s')) h = clamp(h + dy, 0.05, 1 - y)
        if (d.mode.includes('w')) {
          const nx = clamp(x + dx, 0, x + w - 0.05)
          w += x - nx
          x = nx
        }
        if (d.mode.includes('n')) {
          const ny = clamp(y + dy, 0, y + h - 0.05)
          h += y - ny
          y = ny
        }
      }
      setCrop({ x, y, w, h })
    } else {
      const frac = clamp((e.clientX - d.rect.left) / d.rect.width, 0, 1)
      const t = frac * duration
      if (d.which === 'in') {
        const ns = clamp(t, 0, end - 0.1)
        setStart(ns)
        seek(ns)
      } else {
        const ne = clamp(t, start + 0.1, duration)
        setEnd(ne)
        seek(ne)
      }
    }
  }
  const endDrag = () => {
    drag.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', endDrag)
  }

  const seek = (t) => {
    const v = videoRef.current
    if (v) v.currentTime = clamp(t, 0, duration || 0)
  }

  // Loop playback within the selected [start, end] range so you preview the cut.
  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const { start: s, end: e } = bounds.current
    if (v.currentTime > e + 0.05 || v.currentTime < s - 0.05) {
      v.currentTime = s
    }
    setCurrent(v.currentTime)
  }

  const setInToPlayhead = () => setStart(clamp(current, 0, end - 0.1))
  const setOutToPlayhead = () => setEnd(clamp(current, start + 0.1, duration))
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }
  const resetTrim = () => {
    setStart(0)
    setEnd(duration)
    seek(0)
  }

  const save = () =>
    onSave({ start, end, crop: enabled ? crop : null, rotate })

  const pct = (n) => `${(n * 100).toFixed(2)}%`
  const tpct = (t) => (duration ? `${(t / duration) * 100}%` : '0%')
  const kept = Math.max(0, end - start)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="name" title={clip.name}>{clip.name}</span>
          <button className="link" onClick={onClose}>✕ Close</button>
        </div>

        <div className="player-scroll">
          <div className="player-wrap" ref={boxRef}>
            <video
              ref={videoRef}
              src={clip.url}
              autoPlay
              playsInline
              style={{ transform: `rotate(${rotate}deg)`, transition: 'transform .25s ease' }}
              onLoadedMetadata={() => seek(clip.start ?? 0)}
              onTimeUpdate={onTimeUpdate}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            {enabled && (
              <div className="crop-overlay">
                <div
                  className="crop-box"
                  style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
                  onPointerDown={(e) => beginCrop(e, 'move')}
                >
                  {['nw', 'ne', 'sw', 'se'].map((h) => (
                    <span key={h} className={`handle ${h}`} onPointerDown={(e) => beginCrop(e, h)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- Cut / trim timeline ---- */}
        <div className="trim-bar">
          <button className="play-btn" onClick={togglePlay} title="Play / pause">
            {playing ? '❚❚' : '►'}
          </button>
          <div
            className="trim-track"
            ref={trackRef}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seek(clamp((e.clientX - rect.left) / rect.width, 0, 1) * duration)
            }}
          >
            <div className="trim-range" style={{ left: tpct(start), width: tpct(end - start) }} />
            <div className="trim-playhead" style={{ left: tpct(current) }} />
            <div className="trim-handle in" style={{ left: tpct(start) }} onPointerDown={(e) => beginTrim(e, 'in')} />
            <div className="trim-handle out" style={{ left: tpct(end) }} onPointerDown={(e) => beginTrim(e, 'out')} />
          </div>
          <span className="trim-time">{formatTime(current)} / {formatTime(duration)}</span>
        </div>

        <div className="trim-actions">
          <button className="chip" onClick={setInToPlayhead}>⇤ Set start here</button>
          <button className="chip" onClick={setOutToPlayhead}>Set end here ⇥</button>
          <span className="trim-readout">
            Keep <strong>{formatTime(start)}</strong> → <strong>{formatTime(end)}</strong>{' '}
            (<strong>{formatTime(kept)}</strong>)
          </span>
          {(start > 0 || end < duration) && (
            <button className="link" onClick={resetTrim}>Reset cut</button>
          )}
        </div>

        <div className="trim-actions rotate-actions">
          <span className="rotate-label">Rotate</span>
          <button className="chip" onClick={() => rotateBy(-90)} title="Rotate left 90°">↺ Left</button>
          <button className="chip" onClick={() => rotateBy(90)} title="Rotate right 90°">↻ Right</button>
          <span className="trim-readout">{rotate}°</span>
          {rotate !== 0 && (
            <button className="link" onClick={() => setRotate(0)}>Reset rotation</button>
          )}
        </div>

        <div className="modal-controls">
          <label className="checkbox">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Enable crop</span>
          </label>
          {enabled && (
            <span className="crop-info">
              Crop {Math.round(crop.w * 100)}% × {Math.round(crop.h * 100)}% · drag box / corners
            </span>
          )}
          <div className="modal-actions">
            {enabled && (
              <button className="link" onClick={() => setCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })}>
                Reset crop
              </button>
            )}
            <button className="primary" onClick={save}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Read duration + grab a thumbnail frame, all client-side (no ffmpeg needed).
function probeVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = url
    const fallback = () => resolve({ url, duration: 0, thumb: null })
    video.onloadedmetadata = () => {
      const duration = isFinite(video.duration) ? video.duration : 0
      video.currentTime = Math.min(1, duration / 2)
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = 160 / (video.videoWidth || 160)
          canvas.width = 160
          canvas.height = Math.round((video.videoHeight || 90) * scale)
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
          resolve({ url, duration, thumb: canvas.toDataURL('image/jpeg', 0.6) })
        } catch {
          resolve({ url, duration, thumb: null })
        }
      }
      video.onerror = fallback
    }
    video.onerror = fallback
  })
}

function CoffeePage() {
  const qrSrc = `${import.meta.env.BASE_URL}qr.jpg`
  const [imgOk, setImgOk] = useState(true)
  return (
    <div className="coffee-wrap">
      <div className="coffee-card">
        <div className="coffee-emoji">☕</div>
        <h1 className="coffee-title">Buy me a coffee</h1>
        <p className="coffee-sub">
          If {BRAND} Studio saved you some time, a coffee keeps it caffeinated,
          free &amp; ad-free. Scan the code to support the project 💛
        </p>
        <div className="qr-wrap">
          {imgOk ? (
            <img src={qrSrc} alt="Support QR code" onError={() => setImgOk(false)} />
          ) : (
            <div className="qr-missing">
              <span>QR code goes here</span>
              <small>Save your code as <code>public/qr.jpg</code></small>
            </div>
          )}
        </div>
        <p className="coffee-note">📱 Scan with your phone camera</p>
      </div>
    </div>
  )
}

export default function App() {
  const { process, cancel, loading, running, progress, status, elapsed, eta, isCancelledError } =
    useFFmpeg()
  const [clips, setClips] = useState([])
  const [quality, setQuality] = useState('balanced')
  const [resolution, setResolution] = useState('720')
  const [format, setFormat] = useState('mp4')
  const [mute, setMute] = useState(false)
  const [mode, setMode] = useState('quality') // 'quality' | 'size'
  const [targetMB, setTargetMB] = useState(25)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [view, setView] = useState('video')
  const inputRef = useRef(null)

  const editingClip = clips.find((c) => c.id === editingId) || null
  const tool = TOOLS.find((t) => t.id === view) || TOOLS[0]
  // Remember the last editing tool so the logo / back returns to it from the coffee page.
  const lastToolRef = useRef('video')
  if (view !== 'coffee') lastToolRef.current = view
  const goHome = () => setView(lastToolRef.current)

  const totalInputSize = useMemo(() => clips.reduce((s, c) => s + c.size, 0), [clips])
  const totalDuration = useMemo(
    () => clips.reduce((s, c) => s + Math.max(0, c.end - c.start), 0),
    [clips]
  )

  const addFiles = async (list) => {
    const incoming = Array.from(list).filter((f) => f.type.startsWith('video/'))
    setResult(null)
    setError('')
    for (const file of incoming) {
      const { url, duration, thumb } = await probeVideo(file)
      setClips((prev) => [
        ...prev,
        {
          id: ++clipId,
          file,
          name: file.name,
          size: file.size,
          url,
          duration,
          thumb,
          start: 0,
          end: duration,
          rotate: 0,
        },
      ])
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  const move = (index, dir) =>
    setClips((prev) => {
      const next = [...prev]
      const t = index + dir
      if (t < 0 || t >= next.length) return prev
      ;[next[index], next[t]] = [next[t], next[index]]
      return next
    })

  const remove = (id) =>
    setClips((prev) => {
      const gone = prev.find((c) => c.id === id)
      if (gone?.url) URL.revokeObjectURL(gone.url)
      return prev.filter((c) => c.id !== id)
    })
  const clearAll = () =>
    setClips((prev) => {
      prev.forEach((c) => c.url && URL.revokeObjectURL(c.url))
      return []
    })
  const updateTrim = (id, key, value) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)))

  const run = async () => {
    setError('')
    setResult(null)
    try {
      const blob = await process(clips, {
        crf: QUALITY[quality].crf,
        targetHeight: RESOLUTION[resolution].height,
        format,
        mute,
        mode,
        targetMB: Number(targetMB) || 25,
      })
      setResult({ url: URL.createObjectURL(blob), size: blob.size, ext: FORMAT[format].ext })
    } catch (err) {
      if (isCancelledError(err)) return // user cancelled — status already set
      console.error(err)
      setError(err?.message || 'Processing failed. See console for details.')
    }
  }

  const busy = loading || running
  const estOutput =
    mode === 'size' && totalDuration > 0 ? Number(targetMB) * 1024 * 1024 : null

  return (
    <div className="app">
      <div className="bg-glow one" />
      <div className="bg-glow two" />

      <header className="topbar">
        <button className="brand" onClick={goHome} title="Back to editor">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt={BRAND}
          />
        </button>
        <nav className="nav">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={view === t.id ? 'active' : ''}
              onClick={() => setView(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {view === 'coffee' && <CoffeePage />}

      {view !== 'coffee' && (
      <div className="shell">
        <div className="hero">
          <h1>{tool.title}</h1>
          <p className="sub">{tool.sub}</p>
        </div>

        {view === 'pdf' && <main className="main-panel"><PdfCompressor /></main>}
        {view === 'image' && <main className="main-panel"><ImageCompressor /></main>}

        {view === 'video' && (
        <main className="main-panel">
          <div
            className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="dz-icon">＋</div>
        <p><strong>Drop videos here</strong> or click to browse</p>
        <span className="hint">MP4, MOV, WebM, MKV… — merged in the order shown below</span>
      </div>

      {clips.length > 0 && (
        <section className="list">
          <div className="list-head">
            <span>
              {clips.length} clip(s) · {formatBytes(totalInputSize)} · {formatTime(totalDuration)} total
            </span>
            <button className="link" onClick={clearAll} disabled={busy}>Clear all</button>
          </div>
          {clips.map((c, i) => (
            <div className="clip" key={c.id}>
              <span className="idx">{i + 1}</span>
              <button
                className="thumb-btn"
                onClick={() => setEditingId(c.id)}
                disabled={busy}
                title="Play & crop"
              >
                {c.thumb ? (
                  <img className="thumb" src={c.thumb} alt="" />
                ) : (
                  <div className="thumb thumb-empty">🎬</div>
                )}
                <span className="thumb-play">▶</span>
              </button>
              <div className="clip-body">
                <div className="clip-top">
                  <span className="name" title={c.name}>{c.name}</span>
                  <span className="size">{formatBytes(c.size)}</span>
                </div>
                <div className="trim">
                  <label>
                    Start
                    <input
                      type="number" min="0" max={c.duration} step="0.1"
                      value={c.start}
                      onChange={(e) =>
                        updateTrim(c.id, 'start', Math.min(Number(e.target.value), c.end))
                      }
                      disabled={busy}
                    />s
                  </label>
                  <label>
                    End
                    <input
                      type="number" min="0" max={c.duration} step="0.1"
                      value={c.end}
                      onChange={(e) =>
                        updateTrim(c.id, 'end', Math.max(Number(e.target.value), c.start))
                      }
                      disabled={busy}
                    />s
                  </label>
                  <span className="dur">of {formatTime(c.duration)} → {formatTime(c.end - c.start)}</span>
                  <button className="crop-btn" onClick={() => setEditingId(c.id)} disabled={busy}>
                    ▶ Play · cut{c.crop ? ' · ✂ crop' : ''}{c.rotate ? ` · ⟳ ${c.rotate}°` : ''}
                  </button>
                </div>
              </div>
              <div className="row-actions">
                <button onClick={() => move(i, -1)} disabled={busy || i === 0} title="Move up">↑</button>
                <button onClick={() => move(i, 1)} disabled={busy || i === clips.length - 1} title="Move down">↓</button>
                <button onClick={() => remove(c.id)} disabled={busy} title="Remove">✕</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="controls">
        <div className="mode-tabs">
          <button className={mode === 'quality' ? 'active' : ''} onClick={() => setMode('quality')} disabled={busy}>
            Quality mode
          </button>
          <button className={mode === 'size' ? 'active' : ''} onClick={() => setMode('size')} disabled={busy}>
            Target size
          </button>
        </div>

        <div className="control-grid">
          {mode === 'quality' ? (
            <label>
              <span>Quality</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={busy}>
                {Object.entries(QUALITY).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>Target size (MB)</span>
              <input
                className="num"
                type="number" min="1" step="1"
                value={targetMB}
                onChange={(e) => setTargetMB(e.target.value)}
                disabled={busy}
              />
            </label>
          )}

          <label>
            <span>Resolution</span>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={busy}>
              {Object.entries(RESOLUTION).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={busy}>
              {Object.entries(FORMAT).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} disabled={busy} />
            <span>Remove audio</span>
          </label>
        </div>

        {mode === 'size' && (
          <p className="mode-hint">
            Bitrate is auto-calculated to fit ~{targetMB} MB across {formatTime(totalDuration)} of video.
          </p>
        )}

        <button className="primary go" onClick={run} disabled={busy || clips.length === 0}>
          {running ? 'Processing…' : clips.length > 1 ? 'Merge & Compress' : 'Compress'}
        </button>
      </section>

      {busy && (
        <section className="progress">
          <div className="bar"><div className="fill" style={{ width: `${progress}%` }} /></div>
          <div className="progress-row">
            <span className="status">{status || 'Working…'}</span>
            <span className="timing">
              {progress > 0 && `${progress}% · `}
              Elapsed {formatTime(elapsed)}
              {eta != null && ` · ~${formatTime(eta)} left`}
            </span>
          </div>
          {running && (
            <button className="cancel" onClick={cancel}>Cancel</button>
          )}
        </section>
      )}

      {error && <div className="error">⚠ {error}</div>}

      {result && (
        <section className="result">
          <h2>Result</h2>
          <video src={result.url} controls />
          <div className="result-meta">
            <span>Output: <strong>{formatBytes(result.size)}</strong></span>
            {totalInputSize > 0 && (
              <span className={result.size < totalInputSize ? 'ok' : 'up'}>
                {result.size < totalInputSize
                  ? `↓ ${Math.round((1 - result.size / totalInputSize) * 100)}% smaller`
                  : `↑ ${Math.round((result.size / totalInputSize - 1) * 100)}% larger`}
              </span>
            )}
          </div>
          <a className="primary download" href={result.url} download={`merged-output.${result.ext}`}>
            Download {result.ext.toUpperCase()}
          </a>
        </section>
      )}
        </main>
        )}

        <QuoteAside />
      </div>
      )}

      <footer className="footer">
        <span className="footer-left">
          © {new Date().getFullYear()} {BRAND} · runs entirely in your browser · Created by{' '}
          <a
            className="footer-link"
            href="https://ssanjay.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sanjay
          </a>
        </span>
        <button className="coffee-btn" onClick={() => setView('coffee')}>
          ☕ Buy me a coffee
        </button>
      </footer>

      {editingClip && (
        <ClipEditor
          clip={editingClip}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            setClips((prev) =>
              prev.map((c) => (c.id === editingClip.id ? { ...c, ...patch } : c))
            )
            setEditingId(null)
          }}
        />
      )}
    </div>
  )
}
