// Python's number and time formatting, as the WebDAQ server writes its files.

const pad = (n: number, w = 2) => String(Math.trunc(n)).padStart(w, '0')

/** Python f'{x:.{p}e}': mantissa with p decimals, exponent with sign and at least 2 digits. */
export function pyExp(x: number, p: number): string {
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan'
  const [m, e] = x.toExponential(p).split('e')
  const n = Number(e)
  return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`
}

/** Python f'{x:.{p}g}' (trailing zeros removed, exponent form outside [1e-4, 1e{p}). */
export function pyG(x: number, p = 6): string {
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan'
  if (x === 0) return Object.is(x, -0) ? '-0' : '0'
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(p)))))
  if (exp < -4 || exp >= p) {
    const [m, e] = x.toExponential(p - 1).split('e')
    const mm = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m
    const n = Number(e)
    return `${mm}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`
  }
  const s = x.toFixed(Math.max(0, p - 1 - exp))
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}

/** datetime.strftime('%Y-%m-%d %H:%M:%S.%f'), local time. */
export function pyStamp(ms: number): string {
  const t = new Date(ms)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}.${pad(t.getMilliseconds(), 3)}000`
}

/** datetime.isoformat(timespec='seconds'), local time. */
export function pyIsoSeconds(ms: number): string {
  const t = new Date(ms)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
}

/**
 * json.dump(obj, indent=n): Python's separators (', ' inside, ': ' after keys)
 * match JSON.stringify with an indent, except for empty containers, which are the
 * same too; non-ASCII stays as is (ensure_ascii=False in run_metadata_snapshot).
 */
export const pyJson = (obj: unknown, indent: number) => JSON.stringify(obj, null, indent)

export const utf8 = (s: string) => new TextEncoder().encode(s)
