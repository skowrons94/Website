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
    out[key] = localize(pick(value, key, lang), lang)
  }
  return out
}
