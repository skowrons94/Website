'use client'
// The demo's start page (design §3.2, §5.2): choose detectors, source and
// distance, then open WebDAQ. Below 768 px it first says what WebDAQ is for.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLang, aboutHref, type Strings } from './strings'
import { useStrings } from './use-strings'
import { DETECTORS, SOURCES } from './options'
import { control } from '@/demo/shim/transport'

export default function StartPage() {
  const router = useRouter()
  const [lang, t] = useStrings()
  const [phone, setPhone] = useState(false)
  const [detectors, setDetectors] = useState<string>('hpge')
  const [source, setSource] = useState<string>('co60')
  const [distance, setDistance] = useState(10)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tour, setTour] = useState(false)

  useEffect(() => {
    setPhone(window.matchMedia('(max-width: 767px)').matches)
    setTour(typeof (window as any).__webdaqTour === 'function')
  }, [])

  async function start(withTour: boolean) {
    setError(''); setBusy(true)
    const res = await control({ type: 'scenario', scenario: { detectors, source, distance_cm: distance } })
    setBusy(false)
    if (res && res.ok === false) { setError(res.message); return }
    if (withTour) (window as any).__webdaqTour?.(lang)
    router.push('/dashboard')
  }

  if (phone) {
    return (
      <main className="wd-frame wd-start">
        <h1>{t.phoneTitle}</h1>
        <p>{t.phoneText}</p>
        <div className="wd-start-actions">
          <button type="button" className="wd-btn wd-primary" onClick={() => setPhone(false)}>{t.continueAnyway}</button>
          <a className="wd-btn" href={aboutHref(lang)}>{t.readAbout}</a>
        </div>
      </main>
    )
  }

  return (
    <main className="wd-frame wd-start">
      <h1>{t.startTitle}</h1>
      <p className="wd-lead">{t.startLead}</p>
      <p className="wd-muted">{t.simulatedNote}</p>
      <fieldset className="wd-field">
        <legend>{t.detectors}</legend>
        <p className="wd-muted">{t.detectorsHint}</p>
        {DETECTORS.map(d => (
          <label key={d} className="wd-check">
            <input type="radio" name="detectors" value={d} checked={detectors === d} onChange={() => setDetectors(d)} />
            {' '}{t[`det_${d}` as keyof Strings]}
          </label>
        ))}
      </fieldset>
      <label className="wd-field">{t.source}
        <select value={source} onChange={e => setSource(e.target.value)}>
          {SOURCES.map(x => <option key={x} value={x}>{t[`src_${x}` as keyof Strings]}</option>)}
        </select>
      </label>
      <label className="wd-field">{t.distance}: {distance} cm
        <input type="range" min={1} max={50} step={1} value={distance} onChange={e => setDistance(Number(e.target.value))} />
      </label>
      {error && <p role="alert" className="wd-error">{error}</p>}
      <div className="wd-start-actions">
        <button type="button" className="wd-btn wd-primary" disabled={busy} onClick={() => start(false)}>{t.open}</button>
        {tour && <button type="button" className="wd-btn" disabled={busy} onClick={() => start(true)}>{t.tourOffer}</button>}
        <a className="wd-link" href={aboutHref(lang)}>{t.readAbout}</a>
        <button type="button" className="wd-btn" lang={lang === 'en' ? 'it' : 'en'} onClick={() => setLang(lang === 'en' ? 'it' : 'en')}>{t.langSwitch}</button>
      </div>
    </main>
  )
}
