'use client'
/**
 * The demo frame mounted on every page (design §5.1): the banner, the
 * not-in-demo notes, and — loaded on demand — the Run files drawer and the
 * Scenario panel. It follows the site's look (shim/tokens.css), not WebDAQ's.
 */
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { setLang, aboutHref, BASE, type Lang, type Strings } from './strings'
import { useStrings } from './use-strings'
import { resetDemo } from '@/demo/shim/transport'
import { tourActive } from './tour-loader'
import StartPage from './StartPage'

type Panel = 'files' | 'scenario' | null
type PanelProps = { t: Strings; lang: Lang; onClose: () => void }

/** Which note a page gets: keyed by route (design §5.1). */
function noteFor(path: string): keyof Strings | null {
  if (path.startsWith('/auth/login')) return 'noteLogin'
  if (/^\/logbook\/\d+/.test(path)) return 'noteRun'
  if (path.startsWith('/logbook')) return 'noteLogbook'
  if (path.startsWith('/settings')) return 'noteSettings'
  if (path.startsWith('/alerts')) return 'noteAlerts'
  if (path.startsWith('/stats')) return 'noteStats'
  if (path.startsWith('/troubleshoot')) return 'noteTroubleshoot'
  return null
}

const DISMISSED = 'webdaq-demo:v1:notes'
const currentLangGuess = (): Lang => { try { return sessionStorage.getItem('webdaq-demo:v1:lang') === 'it' ? 'it' : 'en' } catch { return 'en' } }
function dismissed(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DISMISSED) || '[]') } catch { return [] }
}

export default function Shell() {
  const path = usePathname() || '/'
  const [lang, t] = useStrings()
  const [panel, setPanel] = useState<Panel>(null)
  const [Comp, setComp] = useState<ComponentType<PanelProps> | null>(null)
  const [menu, setMenu] = useState(false)
  const [hidden, setHidden] = useState<string[]>([])
  const [tour, setTour] = useState(false)

  useEffect(() => {
    setHidden(dismissed())
    setTour(typeof (window as any).__webdaqTour === 'function')
    // Resume a tour this tab was following before a full page load.
    if (tourActive()) (window as any).__webdaqTour?.(currentLangGuess(), true)
    const onTour = () => setTour(true)
    window.addEventListener('webdaq-demo:tour-ready', onTour)
    return () => window.removeEventListener('webdaq-demo:tour-ready', onTour)
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => { setMenu(false) }, [path])
  // Escape closes the Demo menu and puts the focus back on its button.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setMenu(false)
      document.getElementById('wd-menu-button')?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])

  const open = useCallback((p: Panel) => {
    setMenu(false)
    setPanel(p)
    setComp(null)
    const load = p === 'files' ? import('./RunFiles') : import('./ScenarioPanel')
    load.then(m => setComp(() => m.default))
  }, [])

  const note = noteFor(path)
  const showNote = note && !hidden.includes(note)

  const reset = () => {
    if (!window.confirm(t.resetConfirm)) return
    resetDemo()
    window.location.href = `${BASE}/${lang === 'it' ? '?lang=it' : ''}`
  }

  const actions = (
    <>
      {tour && <button type="button" className="wd-btn" onClick={() => { setMenu(false); (window as any).__webdaqTour?.(lang) }}>{t.guide}</button>}
      <button type="button" className="wd-btn" onClick={() => open('files')} aria-haspopup="dialog">{t.runFiles}</button>
      <button type="button" className="wd-btn" onClick={() => open('scenario')} aria-haspopup="dialog">{t.scenario}</button>
      <button type="button" className="wd-btn" onClick={reset}>{t.reset}</button>
      <button type="button" className="wd-btn" lang={lang === 'en' ? 'it' : 'en'} aria-label={t.langSwitchLabel}
        onClick={() => setLang(lang === 'en' ? 'it' : 'en')}>{t.langSwitch}</button>
      <a className="wd-link" href={aboutHref(lang)}>{t.back}</a>
    </>
  )

  return (
    <>
      <div className="wd-frame wd-banner" role="region" aria-label={lang === 'it' ? 'Avviso demo' : 'Demo notice'}>
        <p className="wd-banner-text" title={t.bannerTitle}>
          <span className="wd-wide">{t.banner}</span>
          <span className="wd-narrow">{t.bannerShort}</span>
        </p>
        <div className="wd-actions wd-wide">{actions}</div>
        <button type="button" id="wd-menu-button" className="wd-btn wd-narrow" aria-expanded={menu} aria-controls="wd-menu" onClick={() => setMenu(m => !m)}>{t.menu}</button>
      </div>
      {menu && <div id="wd-menu" className="wd-frame wd-menu">{actions}</div>}
      {showNote && (
        <div className="wd-frame wd-note" role="note">
          <p>{t[note] as string}</p>
          <button type="button" className="wd-btn" onClick={() => {
            const next = [...hidden, note]
            setHidden(next)
            try { sessionStorage.setItem(DISMISSED, JSON.stringify(next)) } catch { /* ignore */ }
          }}>{t.dismiss}</button>
        </div>
      )}
      {(path === '/' || path === '') && <StartPage />}
      {panel && (Comp ? <Comp t={t} lang={lang} onClose={() => setPanel(null)} /> : <div className="wd-frame wd-scrim" aria-busy="true" />)}
    </>
  )
}
