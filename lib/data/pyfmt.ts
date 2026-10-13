/**
 * Python's number formatting and JSON, byte for byte, for the exports.
 *
 * The data explorer's exports (lib/data/export.ts) are a port of
 * scripts/data/nucdata/export.py and must write the same bytes, so the few
 * Python behaviours they rely on are reproduced here:
 *
 *   pyRepr(x, float)       repr() of an int or a float ("90.0", "1e-05")
 *   pyFormat(x, ".6e")     format specs e, f, g with a precision ("{x:.6e}")
 *   pyRound(x)             round() to an integer, half to even
 *   parsePy(text)          JSON.parse that remembers which numbers were
 *                          floats ("90.0") and the order of integer-like keys
 *   dumpPy(value)          json.dumps(value, ensure_ascii=False)
 *   csvRow(fields)         one row of csv.writer (QUOTE_MINIMAL, "\n")
 *
 * Rounding is Python's: correctly rounded from the exact binary value, ties
 * (exact halves) to even. JavaScript's toExponential/toFixed are also
 * correctly rounded but send exact ties up, so a possible tie is settled with
 * the exact decimal expansion (BigInt), which is rare and cheap enough.
 */

/* -- exact decimal expansion -------------------------------------------------- */

/** Digits D (no leading or trailing zeros) and decpt with |x| = 0.D × 10^decpt; x finite, non-zero. */
function exactDigits(x: number): { d: string; decpt: number } {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, Math.abs(x))
  const hi = view.getUint32(0)
  const lo = view.getUint32(4)
  const biased = (hi >>> 20) & 0x7ff
  let mant = (BigInt(hi & 0xfffff) << BigInt(32)) | BigInt(lo)
  let exp: number
  if (biased === 0) exp = -1074
  else {
    mant |= BigInt(1) << BigInt(52)
    exp = biased - 1075
  }
  let d: string
  let decpt: number
  if (exp >= 0) {
    d = (mant << BigInt(exp)).toString()
    decpt = d.length
  } else {
    const k = -exp
    d = (mant * BigInt(5) ** BigInt(k)).toString()
    decpt = d.length - k
  }
  d = d.replace(/0+$/, "")
  return { d, decpt }
}

/** Round digits D (value 0.D × 10^decpt) to `keep` digits, half to even. */
function roundDigits(d: string, decpt: number, keep: number): { d: string; decpt: number } {
  if (keep < 0) return { d: "", decpt }
  if (d.length <= keep) return { d: d.padEnd(keep, "0"), decpt }
  const head = d.slice(0, keep)
  const next = d.charCodeAt(keep) - 48
  const rest = d.slice(keep + 1)
  const last = keep > 0 ? head.charCodeAt(keep - 1) - 48 : 0
  const up = next > 5 || (next === 5 && (/[1-9]/.test(rest) || last % 2 === 1))
  if (!up) return { d: head, decpt }
  // add one in the last kept place
  const digits = head.split("").map(Number)
  let i = digits.length - 1
  while (i >= 0) {
    if (digits[i] === 9) {
      digits[i] = 0
      i--
    } else {
      digits[i]++
      break
    }
  }
  if (i < 0) return { d: "1" + digits.join(""), decpt: decpt + 1 }
  return { d: digits.join(""), decpt }
}

/** n significant digits of |x|, Python's rounding: {d (n digits), decpt}. */
function sigDigits(x: number, n: number): { d: string; decpt: number } {
  const a = Math.abs(x)
  const fast = a.toExponential(n - 1)
  // A tie is possible only when one more digit ends in 5 and is exact.
  const more = a.toExponential(n)
  const [m1] = more.split("e")
  if (m1.endsWith("5") && Number(more) === a) {
    const { d, decpt } = exactDigits(a)
    return roundDigits(d, decpt, n)
  }
  const [m, e] = fast.split("e")
  return { d: m.replace(".", ""), decpt: Number(e) + 1 }
}

/** |x| with p decimals, Python's rounding, as digits D and decpt (D may be empty for 0). */
function fixedString(x: number, p: number): string {
  const a = Math.abs(x)
  if (a >= 1e21) {
    const { d, decpt } = exactDigits(a)
    return d.padEnd(decpt, "0") + (p > 0 ? "." + "0".repeat(p) : "")
  }
  const more = a.toFixed(p + 1)
  if (more.endsWith("5") && Number(more) === a) {
    const { d, decpt } = exactDigits(a)
    const r = roundDigits(d, decpt, decpt + p)
    // digits r.d represent 0.D × 10^r.decpt with r.decpt + p digits after... rebuild
    let intPart: string
    let frac: string
    if (r.decpt <= 0) {
      intPart = "0"
      frac = ("0".repeat(-r.decpt) + r.d).padEnd(p, "0").slice(0, p)
    } else {
      const all = r.d.padEnd(r.decpt + p, "0")
      intPart = all.slice(0, r.decpt) || "0"
      frac = all.slice(r.decpt, r.decpt + p)
    }
    return p > 0 ? `${intPart}.${frac}` : intPart
  }
  return a.toFixed(p)
}

const negative = (x: number) => x < 0 || Object.is(x, -0)

function expPart(e: number): string {
  const s = String(Math.abs(e)).padStart(2, "0")
  return `e${e < 0 ? "-" : "+"}${s}`
}

/* -- repr ----------------------------------------------------------------------- */

/** Python repr() of a number: `float` true for a float (90.0), false for an int (90). */
export function pyRepr(x: number, float: boolean): string {
  if (Number.isNaN(x)) return "nan"
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf"
  if (!float) return String(x)
  if (x === 0) return negative(x) ? "-0.0" : "0.0"
  const sign = x < 0 ? "-" : ""
  const [m, e] = Math.abs(x).toExponential().split("e")
  const d = m.replace(".", "")
  const decpt = Number(e) + 1
  if (decpt > -4 && decpt <= 16) {
    if (decpt <= 0) return `${sign}0.${"0".repeat(-decpt)}${d}`
    if (decpt >= d.length) return `${sign}${d}${"0".repeat(decpt - d.length)}.0`
    return `${sign}${d.slice(0, decpt)}.${d.slice(decpt)}`
  }
  return `${sign}${d[0]}${d.length > 1 ? "." + d.slice(1) : ""}${expPart(decpt - 1)}`
}

/* -- format specs ------------------------------------------------------------------ */

/** Python format(x, spec) for spec "e", ".Ne", ".Nf", "g", ".Ng" (what the exports use). */
export function pyFormat(x: number, spec: string): string {
  const m = /^(?:\.(\d+))?([efg])$/.exec(spec)
  if (!m) throw new Error(`pyFormat: unsupported spec ${spec}`)
  const type = m[2]
  const prec = m[1] === undefined ? 6 : Number(m[1])
  if (Number.isNaN(x)) return "nan"
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf"
  const sign = negative(x) ? "-" : ""
  if (type === "f") return sign + fixedString(x, prec)
  if (type === "e") {
    if (x === 0) return `${sign}${prec > 0 ? "0." + "0".repeat(prec) : "0"}e+00`
    const { d, decpt } = sigDigits(x, prec + 1)
    return `${sign}${d[0]}${prec > 0 ? "." + d.slice(1) : ""}${expPart(decpt - 1)}`
  }
  // g
  const p = prec === 0 ? 1 : prec
  if (x === 0) return `${sign}0`
  const { d, decpt } = sigDigits(x, p)
  const X = decpt - 1
  if (X >= -4 && X < p) {
    let s: string
    if (decpt <= 0) s = `0.${"0".repeat(-decpt)}${d}`
    else if (decpt >= d.length) s = d + "0".repeat(decpt - d.length)
    else s = `${d.slice(0, decpt)}.${d.slice(decpt)}`
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "")
    return sign + s
  }
  const mant = d.replace(/0+$/, "")
  return `${sign}${mant[0]}${mant.length > 1 ? "." + mant.slice(1) : ""}${expPart(X)}`
}

/** Python round(x) to an int: half to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x)
  const diff = x - f
  if (diff < 0.5) return f
  if (diff > 0.5) return f + 1
  return f % 2 === 0 ? f : f + 1
}

/* -- JSON that remembers floats ------------------------------------------------------ */

/** On a parsed array or object: the indices / keys whose number was written as a float. */
export const FLOATS: unique symbol = Symbol("pyFloats")
/** On a parsed object with integer-like keys: its keys in file order. */
export const KEYS: unique symbol = Symbol("pyKeys")

type Marked = { [FLOATS]?: Set<string | number>; [KEYS]?: string[] }

/** Whether `container[key]` was written as a float (an integral float such as 90.0 included). */
export function isFloat(container: unknown, key: string | number): boolean {
  const v = (container as Record<string | number, unknown>)[key]
  if (typeof v !== "number") return false
  if (!Number.isInteger(v)) return true
  return Boolean((container as Marked)[FLOATS]?.has(key))
}

/** Python str() of `container[key]`. */
export function pyStrAt(container: unknown, key: string | number): string {
  return pyStr((container as Record<string | number, unknown>)[key], isFloat(container, key))
}

/** Python str() of a value from parsed JSON (a number needs `float` to tell 90 from 90.0). */
export function pyStr(v: unknown, float = false): string {
  if (v === null || v === undefined) return "None"
  if (v === true) return "True"
  if (v === false) return "False"
  if (typeof v === "number") return pyRepr(v, float || !Number.isInteger(v))
  return String(v)
}

/** The keys of an object in Python's order (file order for a parsed one). */
export function pyKeys(o: object): string[] {
  return (o as Marked)[KEYS] ?? Object.keys(o)
}

const INTLIKE = /^(?:0|[1-9]\d*)$/

/** `{**a, **b}`, keeping Python's key order and the float marks. */
export function pyMerge<A extends object, B extends object>(a: A, b: B): A & B {
  const out = { ...a, ...b } as A & B & Marked
  const order = [...pyKeys(a)]
  const seen = new Set(order)
  for (const k of pyKeys(b)) if (!seen.has(k)) order.push(k)
  const floats = new Set<string | number>()
  for (const k of order) {
    const src = k in b ? b : a
    if (isFloat(src, k)) floats.add(k)
  }
  out[FLOATS] = floats
  if (order.some((k) => INTLIKE.test(k))) out[KEYS] = order
  else delete out[KEYS]
  return out
}

/**
 * JSON.parse that marks floats and keeps integer-like keys in order (see
 * FLOATS, KEYS). A plain recursive-descent parser; strings and numbers are
 * decoded with JSON.parse so escapes and rounding are exactly the standard's.
 */
export function parsePy(text: string): unknown {
  let i = 0
  const n = text.length
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 32 || c === 10 || c === 13 || c === 9) i++
      else break
    }
  }
  const fail = (what: string): never => {
    throw new SyntaxError(`parsePy: ${what} at ${i}`)
  }
  const str = (): string => {
    const start = i
    i++
    let escaped = false
    while (i < n) {
      const c = text.charCodeAt(i)
      if (c === 92) {
        escaped = true
        i += 2
        continue
      }
      if (c === 34) break
      i++
    }
    if (i >= n) fail("unterminated string")
    i++
    const raw = text.slice(start, i)
    return escaped ? (JSON.parse(raw) as string) : raw.slice(1, -1)
  }
  // returns [value, isFloatLexeme]
  const num = (): [number, boolean] => {
    const start = i
    if (text[i] === "-") i++
    while (i < n) {
      const c = text[i]
      if ((c >= "0" && c <= "9") || c === "." || c === "e" || c === "E" || c === "+" || c === "-") i++
      else break
    }
    const lex = text.slice(start, i)
    return [Number(lex), /[.eE]/.test(lex)]
  }
  const value = (): [unknown, boolean] => {
    ws()
    const c = text[i]
    if (c === "{") {
      i++
      const o: Record<string, unknown> & Marked = {}
      const keys: string[] = []
      let floats: Set<string | number> | undefined
      let intlike = false
      ws()
      if (text[i] === "}") {
        i++
        return [o, false]
      }
      for (;;) {
        ws()
        if (text[i] !== '"') fail("expected key")
        const k = str()
        ws()
        if (text[i] !== ":") fail("expected :")
        i++
        const [v, f] = value()
        if (!(k in o)) keys.push(k)
        o[k] = v
        if (f && Number.isInteger(v)) (floats ??= new Set()).add(k)
        if (INTLIKE.test(k)) intlike = true
        ws()
        if (text[i] === ",") {
          i++
          continue
        }
        if (text[i] === "}") {
          i++
          break
        }
        fail("expected , or }")
      }
      if (floats) o[FLOATS] = floats
      if (intlike) o[KEYS] = keys
      return [o, false]
    }
    if (c === "[") {
      i++
      const a: unknown[] & Marked = []
      let floats: Set<string | number> | undefined
      ws()
      if (text[i] === "]") {
        i++
        return [a, false]
      }
      for (;;) {
        const [v, f] = value()
        if (f && Number.isInteger(v)) (floats ??= new Set()).add(a.length)
        a.push(v)
        ws()
        if (text[i] === ",") {
          i++
          continue
        }
        if (text[i] === "]") {
          i++
          break
        }
        fail("expected , or ]")
      }
      if (floats) a[FLOATS] = floats
      return [a, false]
    }
    if (c === '"') return [str(), false]
    if (c === "t" && text.startsWith("true", i)) {
      i += 4
      return [true, false]
    }
    if (c === "f" && text.startsWith("false", i)) {
      i += 5
      return [false, false]
    }
    if (c === "n" && text.startsWith("null", i)) {
      i += 4
      return [null, false]
    }
    if (c === "N" && text.startsWith("NaN", i)) {
      i += 3
      return [NaN, true]
    }
    if (c === "I" && text.startsWith("Infinity", i)) {
      i += 8
      return [Infinity, true]
    }
    if (c === "-" && text.startsWith("-Infinity", i)) {
      i += 9
      return [-Infinity, true]
    }
    return num()
  }
  const [v] = value()
  ws()
  if (i < n) fail("trailing data")
  return v
}

/* -- json.dumps -------------------------------------------------------------------- */

function dumpString(s: string): string {
  let out = '"'
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k)
    if (c === 34) out += '\\"'
    else if (c === 92) out += "\\\\"
    else if (c === 10) out += "\\n"
    else if (c === 13) out += "\\r"
    else if (c === 9) out += "\\t"
    else if (c === 8) out += "\\b"
    else if (c === 12) out += "\\f"
    else if (c < 32) out += "\\u" + c.toString(16).padStart(4, "0")
    else out += s[k]
  }
  return out + '"'
}

function dumpNumber(v: number, float: boolean): string {
  if (Number.isNaN(v)) return "NaN"
  if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "-Infinity"
  return pyRepr(v, float || !Number.isInteger(v))
}

/** json.dumps(value, ensure_ascii=False) with the default separators (", ", ": "). */
export function dumpPy(value: unknown): string {
  const parts: string[] = []
  const walk = (v: unknown, float: boolean) => {
    if (v === null || v === undefined) parts.push("null")
    else if (v === true) parts.push("true")
    else if (v === false) parts.push("false")
    else if (typeof v === "number") parts.push(dumpNumber(v, float))
    else if (typeof v === "string") parts.push(dumpString(v))
    else if (Array.isArray(v)) {
      if (v.length === 0) {
        parts.push("[]")
        return
      }
      parts.push("[")
      for (let k = 0; k < v.length; k++) {
        if (k) parts.push(", ")
        walk(v[k], isFloat(v, k))
      }
      parts.push("]")
    } else if (typeof v === "object") {
      const keys = pyKeys(v as object)
      if (keys.length === 0) {
        parts.push("{}")
        return
      }
      parts.push("{")
      keys.forEach((k, idx) => {
        if (idx) parts.push(", ")
        parts.push(dumpString(k), ": ")
        walk((v as Record<string, unknown>)[k], isFloat(v, k))
      })
      parts.push("}")
    } else parts.push(dumpString(String(v)))
  }
  walk(value, false)
  return parts.join("")
}

/* -- csv.writer ------------------------------------------------------------------------- */

/** One row as Python's csv.writer writes it (QUOTE_MINIMAL, lineterminator "\n"); None → "". */
export function csvRow(fields: (string | null | undefined)[]): string {
  const out = fields.map((f) => {
    const s = f ?? ""
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  })
  if (fields.length === 1 && out[0] === "") return '""\n'
  return out.join(",") + "\n"
}
