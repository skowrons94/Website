// Trimmed JSROOT: exactly the API WebDAQ uses (design §1.6) —
// parse, create, createHistogram, settings, gStyle (core) and redraw, cleanup (draw).
// Painters (TH1, TH2, TCanvas, …) are loaded lazily by draw.mjs through dynamic imports,
// which esbuild splits into separate chunks next to this entry.
export { version, parse, create, createHistogram, settings, gStyle } from 'jsroot/core'
export { redraw, cleanup } from 'jsroot/draw'
