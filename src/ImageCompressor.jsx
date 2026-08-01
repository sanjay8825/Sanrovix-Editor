import { useRef, useState } from 'react'

const IMG_QUALITY = {
  high: { q: 0.85, label: 'High quality (larger file)' },
  balanced: { q: 0.7, label: 'Balanced (recommended)' },
  small: { q: 0.55, label: 'Small size (lower quality)' },
}
const MAXDIM = {
  keep: { px: null, label: 'Keep original size' },
  '2048': { px: 2048, label: 'Max 2048px' },
  '1280': { px: 1280, label: 'Max 1280px' },
  '800': { px: 800, label: 'Max 800px' },
}
const OUT_FORMAT = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP (smaller)' },
  png: { mime: 'image/png', ext: 'png', label: 'PNG (lossless)' },
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${u[i]}`
}

const loadBitmap = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ img, url })
    }
    img.onerror = reject
    img.src = url
  })

export default function ImageCompressor() {
  const [files, setFiles] = useState([])
  const [quality, setQuality] = useState('balanced')
  const [maxDim, setMaxDim] = useState('2048')
  const [format, setFormat] = useState('jpeg')
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const add = (list) => {
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/'))
    setFiles((prev) => [...prev, ...incoming])
    setResults([])
    setError('')
  }

  const compressOne = async (file) => {
    const { img, url } = await loadBitmap(file)
    let { naturalWidth: w, naturalHeight: h } = img
    const cap = MAXDIM[maxDim].px
    if (cap && Math.max(w, h) > cap) {
      const s = cap / Math.max(w, h)
      w = Math.round(w * s)
      h = Math.round(h * s)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(img, 0, 0, w, h)
    URL.revokeObjectURL(url)
    const { mime, ext } = OUT_FORMAT[format]
    const q = IMG_QUALITY[quality].q
    const blob = await new Promise((res) => canvas.toBlob(res, mime, q))
    return {
      name: file.name.replace(/\.[^.]+$/, '') + `-min.${ext}`,
      inSize: file.size,
      outSize: blob.size,
      url: URL.createObjectURL(blob),
      dims: `${w}×${h}`,
    }
  }

  const run = async () => {
    if (!files.length) return
    setWorking(true)
    setError('')
    setResults([])
    setProgress(0)
    try {
      const out = []
      for (let i = 0; i < files.length; i++) {
        out.push(await compressOne(files[i]))
        setProgress(Math.round(((i + 1) / files.length) * 100))
      }
      setResults(out)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not process one of the images.')
    } finally {
      setWorking(false)
    }
  }

  const totalIn = results.reduce((s, r) => s + r.inSize, 0)
  const totalOut = results.reduce((s, r) => s + r.outSize, 0)

  return (
    <>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          add(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => add(e.target.files)}
        />
        <div className="dz-icon">🖼️</div>
        <p>
          <strong>{files.length ? `${files.length} image(s) selected` : 'Drop images here'}</strong>
          {!files.length && ' or click to browse'}
        </p>
        <span className="hint">JPG, PNG, WebP — compressed locally, nothing is uploaded</span>
      </div>

      <section className="controls">
        <div className="control-grid">
          <label>
            <span>Quality</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={working}>
              {Object.entries(IMG_QUALITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Max dimension</span>
            <select value={maxDim} onChange={(e) => setMaxDim(e.target.value)} disabled={working}>
              {Object.entries(MAXDIM).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={working}>
              {Object.entries(OUT_FORMAT).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          {files.length > 0 && (
            <label className="checkbox">
              <button className="link" onClick={() => setFiles([])} disabled={working}>Clear all</button>
            </label>
          )}
        </div>
        <button className="primary go" onClick={run} disabled={working || !files.length}>
          {working ? 'Compressing…' : `Compress ${files.length || ''} image${files.length === 1 ? '' : 's'}`}
        </button>
      </section>

      {working && (
        <section className="progress">
          <div className="bar"><div className="fill" style={{ width: `${progress}%` }} /></div>
          <div className="progress-row">
            <span className="status">Compressing…</span>
            <span className="timing">{progress}%</span>
          </div>
        </section>
      )}

      {error && <div className="error">⚠ {error}</div>}

      {results.length > 0 && (
        <section className="result">
          <h2>Results</h2>
          <div className="result-meta">
            <span>Total: <strong>{formatBytes(totalIn)}</strong> → <strong>{formatBytes(totalOut)}</strong></span>
            {totalIn > 0 && (
              <span className={totalOut < totalIn ? 'ok' : 'up'}>
                {totalOut < totalIn
                  ? `↓ ${Math.round((1 - totalOut / totalIn) * 100)}% smaller`
                  : `↑ ${Math.round((totalOut / totalIn - 1) * 100)}% larger`}
              </span>
            )}
          </div>
          <div className="img-results">
            {results.map((r, i) => (
              <div className="img-result" key={i}>
                <img src={r.url} alt="" />
                <div className="img-result-body">
                  <span className="name" title={r.name}>{r.name}</span>
                  <span className="size">
                    {formatBytes(r.inSize)} → {formatBytes(r.outSize)} · {r.dims}
                  </span>
                </div>
                <a className="chip" href={r.url} download={r.name}>Download</a>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
