// WebDAQ demo overlay #6 (design §2.3): same loadJSROOT(), but from the
// self-hosted, trimmed JSROOT under the demo's base path instead of
// https://root.cern/js/latest/build/jsroot.js. (A webpack alias cannot be used
// here: Next resolves '@/…' through tsconfig paths before aliases apply.)
export { loadJSROOT } from '@/demo/shim/load-jsroot'
