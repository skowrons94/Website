'use client'
// The Run files drawer (design §3.10): each finished run's directory, regenerated
// by the worker, one file or all of them as a .zip (fflate, loaded on demand).
import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import type { Strings, Lang } from './strings'
import { PANEL } from './panel-strings'
import { control, onState } from '@/demo/shim/transport'

type RunRow = { run_number: number; start_time: string | null; end_time: string | null; flag: string }
type DemoFile = { name: string; type: string; bytes: Uint8Array }

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1048576).toFixed(2)} MB`)

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function RunFiles({ t, lang, onClose }: { t: Strings; lang: Lang; onClose: () => void }) {
  const p = PANEL[lang]
  const [runs, setRuns] = useState<RunRow[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [files, setFiles] = useState<DemoFile[] | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const take = (s: any) => setRuns((s?.runs ?? []).filter((r: RunRow) => r.end_time).sort((a: RunRow, b: RunRow) => b.run_number - a.run_number))
    // Ask the worker on open rather than trust the last broadcast: a run stopped a
    // moment ago must already be listed.
    let live = true
    control({ type: 'state' }).then(s => { if (live) take(s) })
    const off = onState(take)
    return () => { live = false; off() }
  }, [])

  async function show(n: number) {
    setOpen(n); setFiles(null); setMsg(p.preparing)
    const r = await control({ type: 'files', run: n })
    if (!r?.ok) { setMsg(r?.message ?? 'Error'); return }
    setFiles(r.files); setMsg('')
  }
  async function zipAll(n: number) {
    if (!files) return
    setMsg(p.preparing)
    const { zipFiles } = await import('./zip')
    const entries: Record<string, Uint8Array> = {}
    for (const f of files) entries[`run${n}/${f.name}`] = f.bytes
    save(`webdaq-demo-run${n}.zip`, new Blob([zipFiles(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    setMsg('')
  }

  return (
    <Dialog title={p.filesTitle} onClose={onClose} closeLabel={t.close}>
      <p className="wd-muted">{p.filesLead}</p>
      {!runs.length && <p>{p.noRuns}</p>}
      <ul className="wd-list">
        {runs.map(r => (
          <li key={r.run_number}>
            <div className="wd-row">
              <strong>{p.run} {r.run_number}</strong>
              <span className="wd-muted">{r.start_time ? new Date(r.start_time).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB') : ''}</span>
              <button type="button" className="wd-btn" aria-expanded={open === r.run_number} onClick={() => show(r.run_number)}>{p.show}</button>
            </div>
            {open === r.run_number && (
              <div>
                <p className="wd-muted" aria-live="polite">{msg}</p>
                {files && (
                  <>
                    <ul className="wd-files">
                      {files.map(f => (
                        <li key={f.name}>
                          <button type="button" className="wd-linkbtn" onClick={() => save(f.name, new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.type }))}>{f.name}</button>
                          <span className="wd-muted">{size(f.bytes.length)}</span>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="wd-btn wd-primary" onClick={() => zipAll(r.run_number)}>{p.downloadAll}</button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
