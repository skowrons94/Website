'use client'
// The Scenario panel: detectors, source, distance, activity, background level,
// beam current, and the two faults of design §3.6. Applied through the worker.
import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import type { Strings, Lang } from './strings'
import { PANEL } from './panel-strings'
import { control, onState } from '@/demo/shim/transport'
import { DETECTORS, SOURCES } from './options'

export default function ScenarioPanel({ t, lang, onClose }: { t: Strings; lang: Lang; onClose: () => void }) {
  const p = PANEL[lang]
  const [s, setS] = useState<Record<string, any> | null>(null)
  const [faultBoard, setFaultBoard] = useState(false)
  const [faultStall, setFaultStall] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => onState(st => setS(prev => prev ?? { ...st.scenario })), [])
  if (!s) return <Dialog title={p.scenarioTitle} onClose={onClose} closeLabel={t.close}><p>…</p></Dialog>
  const set = (k: string, v: unknown) => setS({ ...s, [k]: v })
  const logA = Math.log10(s.activity_Bq || 2e4)

  async function apply() {
    setMsg('')
    const r = await control({ type: 'scenario', scenario: s })
    await control({ type: 'fault', board_fail_at_s: faultBoard ? 60 : null, stall_at_s: faultStall ? 30 : null })
    setMsg(r?.ok === false ? r.message : p.applied)
  }

  return (
    <Dialog title={p.scenarioTitle} onClose={onClose} closeLabel={t.close}>
      <fieldset className="wd-field">
        <legend>{t.detectors}</legend>
        {DETECTORS.map(d => (
          <label key={d} className="wd-check"><input type="radio" name="wd-det" checked={s.detectors === d} onChange={() => set('detectors', d)} /> {t[`det_${d}` as keyof Strings]}</label>
        ))}
      </fieldset>
      <label className="wd-field">{t.source}
        <select value={s.source} onChange={e => set('source', e.target.value)}>
          {SOURCES.map(x => <option key={x} value={x}>{t[`src_${x}` as keyof Strings]}</option>)}
        </select>
      </label>
      <label className="wd-field">{t.distance}: {s.distance_cm} cm
        <input type="range" min={1} max={50} step={1} value={s.distance_cm} onChange={e => set('distance_cm', Number(e.target.value))} />
      </label>
      <label className="wd-field">{p.activity}: {(s.activity_Bq / 1000).toFixed(s.activity_Bq < 1e4 ? 1 : 0)} kBq
        <input type="range" min={3} max={6} step={0.05} value={logA} onChange={e => set('activity_Bq', Math.round(10 ** Number(e.target.value)))} />
      </label>
      <fieldset className="wd-field">
        <legend>{p.background}</legend>
        <label className="wd-check"><input type="radio" name="wd-bg" checked={s.background === 'underground'} onChange={() => set('background', 'underground')} /> {p.bgUnderground}</label>
        <label className="wd-check"><input type="radio" name="wd-bg" checked={s.background === 'surface'} onChange={() => set('background', 'surface')} /> {p.bgSurface}</label>
      </fieldset>
      {s.source === 'n14pg' && (
        <>
          <label className="wd-field">{p.beamCurrent}: {s.beam_I0_uA} µA
            <input type="range" min={10} max={300} step={10} value={s.beam_I0_uA} onChange={e => set('beam_I0_uA', Number(e.target.value))} />
          </label>
          <p className="wd-muted">{p.yieldFactor}: ×{s.yield_factor}</p>
        </>
      )}
      <fieldset className="wd-field">
        <legend>{p.faults}</legend>
        <label className="wd-check"><input type="checkbox" checked={faultBoard} onChange={e => setFaultBoard(e.target.checked)} /> {p.faultBoard}</label>
        <label className="wd-check"><input type="checkbox" checked={faultStall} onChange={e => setFaultStall(e.target.checked)} /> {p.faultStall}</label>
      </fieldset>
      <button type="button" className="wd-btn wd-primary" onClick={apply}>{p.apply}</button>
      <p className="wd-muted" role="status">{msg}</p>
    </Dialog>
  )
}
