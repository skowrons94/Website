// Defines window.__webdaqTour: the tour (tour/, phase P5) is a chunk of its own,
// loaded the first time someone asks for it. Imported by Shell.tsx at module
// evaluation, so the start page and the banner see it on their first render.
const KEY = 'webdaq-demo:v1:tour'

if (typeof window !== 'undefined') {
  const load = () => import('@/demo/tour')
  ;(window as any).__webdaqTour = (lang: 'en' | 'it', resume = false) => load().then(m => m.startTour(lang, resume))
  window.dispatchEvent(new Event('webdaq-demo:tour-ready'))
}

/** A tour this tab was following before the page loaded. */
export function tourActive(): boolean {
  try { return !!sessionStorage.getItem(KEY) } catch { return false }
}
