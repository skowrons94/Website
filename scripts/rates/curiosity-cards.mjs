/**
 * The social cards of the rate curiosities: public/rates/cards/<id>.<lang>.png,
 * 1200 × 630, one per curiosity and language, drawn from the same words and
 * numbers as the pages (lib/rates/curiosities.ts):
 * the reaction, the sentence, a before/after bar, the knock-on and energy
 * lines when the card has them, the one-zone caveat (and the energy's) and
 * the address. SVG rendered by sharp (Next.js' own image library) with the
 * system's fonts (DejaVu Serif, Inter).
 *
 * The cards are committed, like public/og.png: the Pages build runs Node 20
 * (no TypeScript imports) and the Docker image has no fonts. cards.json
 * records the sentence each card shows, and `npm run test:rates` fails when
 * a sentence has changed since: then rerun
 *
 *     SITE_URL=https://… node scripts/rates/curiosity-cards.mjs
 */

import fs from "node:fs"
import path from "node:path"

import { CURIOSITIES, cardText, curiosityContext, curiosityPath, curiosityRatio, curiosityText } from "../../lib/rates/curiosities.ts"

const ROOT = process.cwd()
const DATA = path.join(ROOT, "public", "rates")
const OUT = path.join(DATA, "cards")
const SITE = (process.env.SITE_URL ?? "").replace(/\/$/, "") + (process.env.BASE_PATH ?? "")

let sharp
try {
  sharp = (await import("sharp")).default
} catch {
  console.log("curiosity cards: sharp not installed, skipped")
  process.exit(0)
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const SERIF = "'DejaVu Serif', 'Noto Serif', Georgia, serif"
const SANS = "Inter, 'DejaVu Sans', 'Noto Sans', Arial, sans-serif"
const INK = "#1f1c19"
const MUTED = "#5f5952"
const ACCENT = "#245a9e"

/** Words with their weight, wrapped greedily by an estimate of their width. */
function wrap(parts, size, width) {
  const words = parts.flatMap((p) => p.text.split(/(?<= )/).filter(Boolean).map((w) => ({ w, bold: Boolean(p.bold) })))
  const lines = [[]]
  let x = 0
  for (const t of words) {
    const wpx = [...t.w].length * size * (t.bold ? 0.56 : 0.53)
    if (x + wpx > width && lines[lines.length - 1].length) {
      lines.push([])
      x = 0
    }
    lines[lines.length - 1].push(t)
    x += wpx
  }
  return lines
}

function svg(spec, c, lang, ratio) {
  const it = lang === "it"
  const extras = [c.knockLine, c.energyLine].filter(Boolean)
  const notes = [c.shortCaveat, c.shortEnergy].filter(Boolean)
  // room below the sentence: two bars, the extra lines, the notes, the address
  const below = 62 + extras.length * 32 + 30 + notes.length * 30 + 34
  let size = 40
  const fits = (n, sz) => 150 + n * sz * 1.28 + 20 + below <= 606
  let lines = wrap(c.parts, size, 1040)
  while ((lines.length > 5 || !fits(lines.length, size)) && size > 26) lines = wrap(c.parts, (size -= 2), 1040)
  const lh = size * 1.28
  const y0 = 150
  const text = lines
    .map(
      (l, i) =>
        `<text xml:space="preserve" x="80" y="${y0 + i * lh}" font-family="${SERIF}" font-size="${size}" fill="${INK}">${l
          .map((t) => `<tspan${t.bold ? ' font-weight="700"' : ""}>${esc(t.w)}</tspan>`)
          .join("")}</text>`,
    )
    .join("")
  const by = Math.max(y0 + lines.length * lh + 20, Math.min(400, 606 - below))
  const max = Math.max(1, ratio)
  const W = 640
  const bar = (y, label, v, color) =>
    `<text x="80" y="${y + 17}" font-family="${SANS}" font-size="22" fill="${MUTED}">${esc(label)}</text>` +
    `<rect x="380" y="${y}" width="${W}" height="22" rx="4" fill="#ebe7e1"/>` +
    `<rect x="380" y="${y}" width="${Math.max(6, (W * v) / max)}" height="22" rx="4" fill="${color}"/>`
  const labels = spec.per
    ? it
      ? ["rapporto, tasso di oggi", "rapporto, tasso ×2"]
      : ["ratio, today's rate", "ratio, rate ×2"]
    : it
      ? ["con il tasso di oggi", "con il tasso ×2"]
      : ["with today's rate", "with the rate ×2"]
  const url = `${SITE}${it ? "/it" : ""}${curiosityPath(spec.id)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#fdfcfa"/>
<rect y="620" width="1200" height="10" fill="${ACCENT}"/>
<text x="80" y="84" font-family="${SANS}" font-size="24" fill="${MUTED}">${esc(it ? "Curiosità sui tassi di reazione" : "Reaction rate curiosity")}</text>
${text}
${bar(by, labels[0], 1, "#8b857d")}
${bar(by + 40, labels[1], ratio, ratio >= 1 ? "#6d4bb8" : "#8a5a2b")}
${extras.map((l, i) => `<text x="80" y="${by + 96 + i * 32}" font-family="${SANS}" font-size="23" font-weight="600" fill="${INK}">${esc(l)}</text>`).join("")}
${notes.map((l, i) => `<text x="80" y="${by + 96 + extras.length * 32 + 16 + i * 30}" font-family="${SANS}" font-size="21" fill="${MUTED}">${esc(l)}</text>`).join("")}
<text x="80" y="${by + 96 + extras.length * 32 + 16 + notes.length * 30 + 4}" font-family="${SANS}" font-size="21" fill="${ACCENT}">${esc(url.replace(/^https?:\/\//, ""))}</text>
</svg>`
}

const t0 = performance.now()
fs.mkdirSync(OUT, { recursive: true })
let n = 0
const jobs = []
const manifest = {}
for (const spec of CURIOSITIES) {
  const file = (f) => path.join(DATA, `${spec.net}.${f}`)
  if (!fs.existsSync(file("sensitivity.json"))) continue
  const sens = JSON.parse(fs.readFileSync(file("sensitivity.json"), "utf8"))
  const network = JSON.parse(fs.readFileSync(path.join(DATA, `${spec.net}.json`), "utf8"))
  const base = JSON.parse(fs.readFileSync(file("baseline.json"), "utf8"))
  const ratio = curiosityRatio(spec, sens)
  for (const lang of ["en", "it"]) {
    const c = curiosityText(spec, ratio, lang, curiosityContext(spec, sens, network, base))
    manifest[`${spec.id}.${lang}`] = cardText(c)
    jobs.push(
      sharp(Buffer.from(svg(spec, c, lang, ratio)))
        .png({ compressionLevel: 9, palette: true })
        .toFile(path.join(OUT, `${spec.id}.${lang}.png`)),
    )
    n++
  }
}
await Promise.all(jobs)
fs.writeFileSync(path.join(OUT, "cards.json"), JSON.stringify(manifest, null, 1) + "\n")
console.log(`curiosity cards: ${n} in ${Math.round(performance.now() - t0)} ms (public/rates/cards)`)
