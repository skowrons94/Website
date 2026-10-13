'use client'
import { useEffect, useState } from 'react'
import { en, currentLang, getStrings, type Lang, type Strings } from './strings'

/** The frame's language and strings; follows the EN/IT switch. */
export function useStrings(): [Lang, Strings] {
  const [lang, setL] = useState<Lang>('en')
  const [t, setT] = useState<Strings>(en)
  useEffect(() => {
    const apply = (l: Lang) => {
      const s = getStrings(l)
      if (s instanceof Promise) s.then(x => { setT(x); setL(l) })
      else { setT(s); setL(l) }
    }
    apply(currentLang())
    const onLang = (e: Event) => apply((e as CustomEvent).detail)
    window.addEventListener('webdaq-demo:lang', onLang)
    return () => window.removeEventListener('webdaq-demo:lang', onLang)
  }, [])
  return [lang, t]
}
