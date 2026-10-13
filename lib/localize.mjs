/**
 * Translations that live beside the English in the content files.
 *
 * Every content file stays in its English shape; a translated value sits next
 * to the field it translates, with the language as a suffix: `summary_it`
 * beside `summary`, `intro_it` beside `intro`, `label_it` beside a temperature's
 * `label`. `localize(value, "it")` walks any parsed YAML and returns it in the
 * same shape with each field replaced by its Italian form where one exists, and
 * the English otherwise. The `*_it` keys themselves are dropped, so the pages
 * see exactly the shapes they always did.
 *
 * Plain JavaScript, like `atlas-core.mjs`, because the prebuild scripts read it
 * under bare `node` as well as the site.
 */

/** Languages besides English that a field may carry. */
export const TRANSLATIONS = ["it"]

const SUFFIX = new RegExp(`_(${TRANSLATIONS.join("|")})$`)

/** `summary_it` → true. */
export const isTranslationKey = (key) => SUFFIX.test(key)

/** The value of `field` in `lang`, falling back to English. */
export function pick(entry, field, lang = "en") {
  if (!entry || typeof entry !== "object") return undefined
  if (lang !== "en") {
    const translated = entry[`${field}_${lang}`]
    if (translated !== undefined && translated !== null && translated !== "") return translated
  }
  return entry[field]
}

/** Is `field` of `entry` present in English but missing in `lang`? */
export function untranslated(entry, field, lang) {
  if (lang === "en" || !entry || typeof entry !== "object") return false
  const english = entry[field]
  const empty = english === undefined || english === null || english === "" || (Array.isArray(english) && english.length === 0)
  if (empty) return false
  const translated = entry[`${field}_${lang}`]
  return translated === undefined || translated === null || translated === ""
}

/** `value` in `lang`, recursively; English where a translation is missing. */
export function localize(value, lang = "en") {
  if (Array.isArray(value)) return value.map((v) => localize(v, lang))
  if (!value || typeof value !== "object" || value instanceof Date) return value
  const out = {}
  for (const key of Object.keys(value)) {
    if (isTranslationKey(key)) continue
    const translated = lang === "it" && typeof value[`${key}_it`] === "string" && value[`${key}_it`] !== ""
    const v = localize(pick(value, key, lang), lang)
    out[key] = translated ? elideItalian(v) : v
  }
  return out
}

/* -- Italian articles before nuclides ---------------------------------------- */

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹"

const UNITS = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove",
  "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"]
const TENS = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"]

/**
 * A whole number written out in Italian, as it is read aloud: 8 "otto", 18
 * "diciotto", 85 "ottantacinque", 208 "duecentotto". Tens drop their final
 * vowel before "uno" and "otto" (ventuno, ottantotto); 1000 is "mille".
 */
export function italianNumber(value) {
  const n = Math.floor(Math.abs(Number(value)))
  if (n < 20) return UNITS[n]
  if (n < 100) {
    const unit = n % 10
    const tens = TENS[Math.floor(n / 10)]
    if (unit === 0) return tens
    return (unit === 1 || unit === 8 ? tens.slice(0, -1) : tens) + UNITS[unit]
  }
  if (n < 1000) {
    const h = Math.floor(n / 100)
    const rest = n % 100
    const tail = rest ? italianNumber(rest) : ""
    const hundreds = h === 1 ? "cento" : UNITS[h] + "cento"
    // centotto, duecentottanta: "cento" drops its vowel before otto, ottanta.
    return (tail.startsWith("o") ? hundreds.slice(0, -1) : hundreds) + tail
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000)
    const rest = n % 1000
    return (k === 1 ? "mille" : italianNumber(k) + "mila") + (rest ? italianNumber(rest) : "")
  }
  return String(n)
}

/**
 * Does an Italian reader start this mass number with a vowel? ¹⁶O is read
 * "sedici-O", ⁸⁵Kr "ottantacinque-Kr", ¹⁸F "diciotto-F": the article follows
 * the number as it is spoken, so 1 (uno), 8 (otto), 11 (undici), 80–89
 * (ottanta…) and 800–899 (ottocento…) take "l'", "dell'", and 18 does not.
 */
export function vowelMassNumber(A) {
  return /^[aeiou]/.test(italianNumber(A))
}

// Articles and articulated prepositions, in their full and elided forms.
const MASCULINE = { il: "l'", del: "dell'", al: "all'", dal: "dall'", nel: "nell'", sul: "sull'" }
const FEMININE = { la: "l'", della: "dell'", alla: "all'", dalla: "dall'", nella: "nell'", sulla: "sull'" }
const ELIDED = { "l'": ["il", "la"], "dell'": ["del", "della"], "all'": ["al", "alla"], "dall'": ["dal", "dalla"], "nell'": ["nel", "nella"], "sull'": ["sul", "sulla"] }

const keepCase = (word, model) => (model[0] === model[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word)

/**
 * Italian text with the article before each nuclide in the form its mass
 * number calls for: "il ⁸⁵Kr" → "l'⁸⁵Kr", "del ⁸⁶Kr" → "dell'⁸⁶Kr", "la
 * ⁸⁵Kr(n,γ)" → "l'⁸⁵Kr(n,γ)", and back, "l'¹⁶O" → "il ¹⁶O". A nuclide followed
 * by "(" is a reaction, feminine (la reazione); otherwise masculine.
 */
export function elideItalian(text) {
  if (typeof text !== "string") return text
  const mass = `([${SUPERSCRIPT}]+|\\d+)(?=[A-Z][a-z]?)`
  const full = new RegExp(`(^|[^\\p{L}])(il|del|al|dal|nel|sul|la|della|alla|dalla|nella|sulla) ${mass}`, "giu")
  const elided = new RegExp(`(^|[^\\p{L}])(l|dell|all|dall|nell|sull)['’]${mass}`, "giu")
  const number = (m) => Number([...m].map((c) => (SUPERSCRIPT.includes(c) ? SUPERSCRIPT.indexOf(c) : c)).join(""))
  return text
    .replace(full, (all, pre, article, A) => {
      if (!vowelMassNumber(number(A))) return all
      const lower = article.toLowerCase()
      const short = MASCULINE[lower] ?? FEMININE[lower]
      return `${pre}${keepCase(short, article)}${A}`
    })
    .replace(elided, (all, pre, article, A, offset, whole) => {
      if (vowelMassNumber(number(A))) return all
      const after = whole.slice(offset + all.length).match(/^[A-Z][a-z]?/)
      const reaction = after && whole[offset + all.length + after[0].length] === "("
      const [m, f] = ELIDED[`${article.toLowerCase()}'`]
      return `${pre}${keepCase(reaction ? f : m, article)} ${A}`
    })
}
