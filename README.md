# Video Merger & Compressor

A fully client-side web app to **merge, trim, crop, and compress** videos right in
the browser using [ffmpeg.wasm](https://ffmpegwasm.netlify.app/). Nothing is ever
uploaded — all processing happens locally on your machine.

## Features

- Merge multiple clips into one (any order)
- Per-clip **trim** (start/end) and **crop** (draggable box on a live video player)
- **Quality mode** (CRF presets) or **Target-size mode** ("fit under N MB")
- Downscale to 1080p / 720p / 480p, or keep source resolution
- Output as **MP4 (H.264)** or **WebM (VP8)**, with optional audio removal
- Live progress bar with **elapsed time and ETA**, plus a **Cancel** button

## Run locally

```bash
npm install
npm run dev
```

Then open the printed URL (default http://localhost:5173).

## Requirements & notes

- **Internet on first use.** The FFmpeg core (~30 MB) is loaded from the unpkg
  CDN and cached afterward. (It can be vendored locally for offline use if needed.)
- **Cross-origin isolation is required** (ffmpeg.wasm uses `SharedArrayBuffer`).
  - The Vite dev/preview server sets the needed `COOP`/`COEP` headers automatically.
  - For static hosting that can't set headers (e.g. **GitHub Pages**), a bundled
    service worker (`public/coi-serviceworker.js`) injects them on the client, so
    it still works.
- Large **4K** inputs are slow and memory-heavy in WebAssembly — choose 720p/1080p
  for a smooth experience. VP9/HEVC are intentionally not offered because they
  crash the single-thread wasm core.

## Deploy

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

Deploy the `dist/` folder to any static host. The service worker handles the
cross-origin isolation headers, so GitHub Pages, Netlify, Vercel, etc. all work.
(On hosts where you *can* set headers, adding `COOP: same-origin` +
`COEP: require-corp` is slightly more robust, but not required.)
