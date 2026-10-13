'use client'
// A side drawer for the demo frame: labelled dialog, Esc and the scrim close it,
// focus moves in on open, stays inside while open, and returns where it was.
import { useEffect, useRef, type ReactNode } from 'react'

export default function Dialog({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button, a, input, select')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key !== 'Tab' || !ref.current) return
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select')].filter(x => !x.hasAttribute('disabled'))
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.() }
  }, [onClose])
  return (
    <div className="wd-frame wd-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} className="wd-drawer" role="dialog" aria-modal="true" aria-labelledby="wd-dialog-title">
        <div className="wd-drawer-head">
          <h2 id="wd-dialog-title">{title}</h2>
          <button type="button" className="wd-btn" onClick={onClose}>{closeLabel}</button>
        </div>
        {children}
      </div>
    </div>
  )
}
