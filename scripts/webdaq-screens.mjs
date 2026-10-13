#!/usr/bin/env node
/**
 * Screenshots of the WebDAQ demo for the companion page (/software/webdaq).
 *
 *   node scripts/webdaq-screens.mjs [--base http://localhost:4000/webdaq-demo/] [--only tuning,rois]
 *   node scripts/webdaq-screens.mjs --check      # only check the image budget
 *
 * It opens the built demo (serve it first: `make demo && npx serve public -l 4000`),
 * prepares a run with simulated detectors, takes one screenshot per capability
 * of content/webdaq.yaml, and writes public/images/webdaq/screen-<id>.avif and
 * .webp at 960 × 600. The page shows a screenshot as soon as both files exist,
 * and its drawing until then, so this script is optional and never part of the
 * build.
 *
 * Budget (design §6.4): every image ≤ 60 kB, and the images a visitor loads
 * (one format each) ≤ 300 kB in total. The quality is lowered step by step
 * until a screenshot fits; the script fails if it cannot.
 *
 * Playwright is not a dependency of the site. It is taken from webdaq-demo's
 * own node_modules (where the demo's end-to-end tests install it), or from
 * $PLAYWRIGHT_DIR; the browser from $PW_CHROMIUM if set. sharp comes with Next.
 *
 * The demo's controls are found by role and accessible name, like its tour
 * (webdaq-demo/tour/targets.ts). If the demo exposes
 * `window.__webdaqDemo.prepareScreens()`, that is used instead of clicking.
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "public", "images", "webdaq")
const MAX_FILE = 60 * 1024
const MAX_TOTAL = 300 * 1024
const W = 960
const H = 600

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const BASE = opt("base", "http://localhost:4000/webdaq-demo/").replace(/\/?$/, "/")
const ONLY = opt("only", "")
  .split(",")
  .filter(Boolean)

/** One screenshot per capability id (content/webdaq.yaml); `route` is relative to the demo. */
const SHOTS = [
  { id: "boards", route: "settings/", tab: /^boards$/i, running: false },
  { id: "acquisition", route: "dashboard/", tab: /^overview$/i, running: true },
  { id: "tuning", route: "tuner/", running: false },
  { id: "monitoring", route: "dashboard/", tab: /data rates/i, running: true },
  { id: "rois", route: "dashboard/", tab: /^histograms$/i, running: true },
  { id: "slowcontrol", route: "stats/", running: true },
  { id: "bookkeeping", route: "logbook/1/", running: false },
  { id: "watching", route: "troubleshoot/", running: false },
]

/* -- image budget ------------------------------------------------------------ */

function budget() {
  if (!fs.existsSync(OUT)) return true
  const files = fs.readdirSync(OUT).filter((f) => /\.(avif|webp|png|jpe?g)$/.test(f))
  let ok = true
  for (const f of files) {
    const size = fs.statSync(path.join(OUT, f)).size
    if (size > MAX_FILE) {
      console.error(`over budget: ${f} is ${(size / 1024).toFixed(1)} kB (max 60 kB)`)
      ok = false
    }
  }
  // What a visitor loads: one format (the larger, to be safe) of each image,
  // and of the hero only the large variant.
  const stems = new Map()
  for (const f of files) {
    const stem = f.replace(/\.[^.]+$/, "")
    if (/^dashboard-800$/.test(stem)) continue
    stems.set(stem, Math.max(stems.get(stem) ?? 0, fs.statSync(path.join(OUT, f)).size))
  }
  const total = [...stems.values()].reduce((a, b) => a + b, 0)
  console.log(`webdaq images: ${files.length} files; a visitor loads at most ${(total / 1024).toFixed(1)} kB (max 300 kB)`)
  if (total > MAX_TOTAL) ok = false
  return ok
}

if (args.includes("--check")) process.exit(budget() ? 0 : 1)

/* -- browser ------------------------------------------------------------------- */

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, path.join(ROOT, "webdaq-demo"), ROOT].filter(Boolean)
  for (const dir of dirs) {
    const req = createRequire(path.join(dir, "package.json"))
    for (const name of ["playwright", "@playwright/test", "playwright-core"]) {
      try {
        return req(name)
      } catch {
        /* next */
      }
    }
  }
  console.error("Playwright not found: run `npm ci` in webdaq-demo/, or set PLAYWRIGHT_DIR to a folder whose node_modules has it.")
  process.exit(2)
}

async function clickFirst(page, role, name) {
  const target = page.getByRole(role, { name }).first()
  if ((await target.count()) === 0) return false
  await target.click()
  return true
}

/** The start page: two germanium detectors and ⁶⁰Co, then into WebDAQ. */
async function prepare(page) {
  await page.goto(BASE, { waitUntil: "networkidle" })
  const hook = await page.evaluate(async () => {
    const demo = window.__webdaqDemo
    if (demo && typeof demo.prepareScreens === "function") {
      await demo.prepareScreens()
      return true
    }
    return false
  })
  if (hook) return
  ;(await clickFirst(page, "radio", /HPGe|germanium/i)) || (await clickFirst(page, "button", /HPGe|germanium/i))
  ;(await clickFirst(page, "radio", /60\s*Co|⁶⁰Co|cobalt/i)) || (await clickFirst(page, "button", /60\s*Co|⁶⁰Co|cobalt/i))
  await clickFirst(page, "button", /^(start|enter|continue|open)/i)
  await page.waitForLoadState("networkidle")
}

async function startRun(page) {
  await page.goto(new URL("dashboard/", BASE).href, { waitUntil: "networkidle" })
  if (await clickFirst(page, "button", /start run|^start$/i)) {
    // A few seconds of simulated data, so the spectra and rates have something in them.
    await page.waitForTimeout(8000)
  }
}

async function encode(sharp, png, id) {
  const img = sharp(png).resize(W, H, { fit: "cover", position: "top" })
  const written = []
  for (const [ext, start, step, make] of [
    ["avif", 55, 5, (q) => img.clone().avif({ quality: q, effort: 9 })],
    ["webp", 80, 6, (q) => img.clone().webp({ quality: q, effort: 6 })],
  ]) {
    let q = start
    let buf = await make(q).toBuffer()
    while (buf.length > MAX_FILE && q > 20) {
      q -= step
      buf = await make(q).toBuffer()
    }
    if (buf.length > MAX_FILE) throw new Error(`${id}.${ext}: ${(buf.length / 1024).toFixed(1)} kB even at quality ${q}`)
    fs.writeFileSync(path.join(OUT, `screen-${id}.${ext}`), buf)
    written.push(`${ext} q${q} ${(buf.length / 1024).toFixed(1)} kB`)
  }
  return written.join(", ")
}

async function main() {
  const { chromium } = loadPlaywright()
  const sharp = createRequire(path.join(ROOT, "package.json"))("sharp")
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  // Light theme, desktop size, the device-pixel ratio of a laptop: the
  // screenshot is shown at about 480 px wide, so 960 px stays sharp.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" })
  const page = await context.newPage()

  await prepare(page)
  let running = false
  let failed = 0
  for (const shot of SHOTS) {
    if (ONLY.length && !ONLY.includes(shot.id)) continue
    try {
      if (shot.running && !running) {
        await startRun(page)
        running = true
      }
      await page.goto(new URL(shot.route, BASE).href, { waitUntil: "networkidle" })
      if (shot.tab) await clickFirst(page, "tab", shot.tab)
      await page.waitForTimeout(1500)
      const png = await page.screenshot({ type: "png" })
      console.log(`${shot.id}: ${await encode(sharp, png, shot.id)}`)
    } catch (e) {
      failed++
      console.warn(`${shot.id}: skipped (${e.message})`)
    }
  }
  await browser.close()
  const ok = budget()
  if (failed) console.warn(`${failed} screenshot(s) skipped; the page keeps its drawings for those.`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
