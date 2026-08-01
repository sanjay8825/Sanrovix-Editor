import { useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { jsPDF } from 'jspdf'

// Same-origin worker (bundled by Vite) so it works under cross-origin isolation.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const PDF_QUALITY = {
  high: { dpi: 150, q: 0.82, label: 'High quality (larger file)' },
  balanced: { dpi: 120, q: 0.66, label: 'Balanced (recommended)' },
  small: { dpi: 96, q: 0.5, label: 'Small size (lower quality)' },
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${u[i]}`
}

export default function PdfCompressor() {
  const [file, setFile] = useState(null)
  const [quality, setQuality] = useState('balanced')
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const pick = (f) => {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    setFile(f)
    setResult(null)
    setError('')
  }

  const compress = async () => {
    if (!file) return
    setWorking(true)
    setError('')
    setResult(null)
    setProgress(0)
    try {
      const { dpi, q } = PDF_QUALITY[quality]
      const data = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data }).promise
      const n = pdf.numPages
      const scale = dpi / 72
      let doc

      for (let i = 1; i <= n; i++) {
        setStatus(`Rendering page ${i} of ${n}…`)
        const page = await pdf.getPage(i)
        const base = page.getViewport({ scale: 1 }) // points (1pt = 1/72in)
        const vp = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(vp.width))
        canvas.height = Math.max(1, Math.floor(vp.height))
        const ctx = canvas.getContext('2d')
        // Flatten transparency onto white so JPEG areas don't go black.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport: vp }).promise

        const img = canvas.toDataURL('image/jpeg', q)
        const wPt = base.width
        const hPt = base.height
        const orientation = wPt > hPt ? 'landscape' : 'portrait'
        if (i === 1) doc = new jsPDF({ unit: 'pt', format: [wPt, hPt], orientation })
        else doc.addPage([wPt, hPt], orientation)
        doc.addImage(img, 'JPEG', 0, 0, wPt, hPt)
        setProgress(Math.round((i / n) * 100))
      }

      const blob = doc.output('blob')
      setStatus('Done')
      setResult({ url: URL.createObjectURL(blob), size: blob.size, pages: n })
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not process this PDF.')
    } finally {
      setWorking(false)
    }
  }

  const downloadName = file ? file.name.replace(/\.pdf$/i, '') + '-compressed.pdf' : 'compressed.pdf'

  return (
    <>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pick(e.dataTransfer.files?.[0])
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <div className="dz-icon">📄</div>
        <p>
          <strong>{file ? file.name : 'Drop a PDF here'}</strong>{!file && ' or click to browse'}
        </p>
        <span className="hint">
          {file ? `${formatBytes(file.size)} — click to choose a different file` : 'Compressed entirely in your browser — nothing is uploaded'}
        </span>
      </div>

      <section className="controls">
        <div className="control-grid">
          <label>
            <span>Compression</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} disabled={working}>
              {Object.entries(PDF_QUALITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mode-hint">
          Note: pages are re-rendered as images, so text becomes non-selectable. Best for scanned or
          image-heavy PDFs.
        </p>
        <button className="primary go" onClick={compress} disabled={working || !file}>
          {working ? 'Compressing…' : 'Compress PDF'}
        </button>
      </section>

      {working && (
        <section className="progress">
          <div className="bar"><div className="fill" style={{ width: `${progress}%` }} /></div>
          <div className="progress-row">
            <span className="status">{status || 'Working…'}</span>
            <span className="timing">{progress}%</span>
          </div>
        </section>
      )}

      {error && <div className="error">⚠ {error}</div>}

      {result && (
        <section className="result">
          <h2>Result</h2>
          <div className="result-meta">
            <span>Output: <strong>{formatBytes(result.size)}</strong> · {result.pages} page(s)</span>
            {file && (
              <span className={result.size < file.size ? 'ok' : 'up'}>
                {result.size < file.size
                  ? `↓ ${Math.round((1 - result.size / file.size) * 100)}% smaller`
                  : `↑ ${Math.round((result.size / file.size - 1) * 100)}% larger`}
              </span>
            )}
          </div>
          {file && result.size >= file.size && (
            <p className="mode-hint">
              This PDF was already well-compressed (or text-based), so re-rendering didn't shrink it.
              Try a lower quality, or keep your original.
            </p>
          )}
          <a className="primary download" href={result.url} download={downloadName}>
            Download PDF
          </a>
        </section>
      )}
    </>
  )
}
