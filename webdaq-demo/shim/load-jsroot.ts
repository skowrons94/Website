/**
 * Overlay alias target for `@/lib/load-jsroot` (design §2.3 #6): the same
 * loadJSROOT(), but it imports the self-hosted, trimmed JSROOT bundle under the
 * demo's base path instead of https://root.cern/js/latest/build/jsroot.js.
 */
let jsrootPromise: Promise<void> | null = null

export function loadJSROOT(): Promise<void> {
  if (!jsrootPromise) {
    const url = process.env.NEXT_PUBLIC_DEMO_JSROOT || ''
    jsrootPromise = import(/* webpackIgnore: true */ url).then((m: Record<string, unknown>) => {
      // WebDAQ mutates JSROOT.settings and JSROOT.gStyle; a module namespace is frozen, its objects are not.
      window.JSROOT = { ...m }
    }).catch((e: unknown) => {
      jsrootPromise = null
      throw new Error('Failed to load JSROOT: ' + String((e as Error)?.message ?? e))
    })
  }
  return jsrootPromise
}

declare global {
  interface Window {
    JSROOT: any;
  }
}
