# Network Analysis — DevTools Waterfall

> This step needs a real browser's DevTools, which isn't available from
> this sandbox (no GUI here). Follow the steps below yourself — takes
> about 2 minutes — and fill in the table. Easiest target: run
> `cd frontend && npm run dev`, open `http://localhost:5173` in Chrome,
> and inspect that (most relevant to the project anyway).

## Steps
1. Open the page in Chrome.
2. `F12` (or right-click → Inspect) → **Network** tab.
3. Tick **Disable cache**.
4. Reload (`Ctrl+R` / `Cmd+R`).
5. Read the totals from the status bar at the bottom of the Network panel.
6. Click the **Time** column header to sort by duration — find the slowest request.
7. Scan the **Status** column for any `3xx` or `4xx`.

## Results

| Metric | Value |
|---|---|
| Total requests | *(fill in)* |
| Total transferred size | *(fill in)* |
| Slowest request (name + time) | *(fill in)* |
| Any 3xx/4xx seen? (list URL + status) | *(fill in, or "none") |

## What to say about it
- Why the first request (the HTML document) blocks everything else: the
  browser can't discover `<script>`/`<link>` tags to fetch until it has
  parsed at least part of the HTML.
- Which requests ran in parallel vs. which waited on something else
  (e.g. an XHR/fetch to `rooms-service` that only fires after the JS
  bundle has loaded and executed).
- One concrete idea to make the slowest request faster (e.g. compression,
  caching via the `ETag`/`Cache-Control` headers our own services already
  send, code-splitting the JS bundle).
