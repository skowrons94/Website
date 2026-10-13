#!/usr/bin/env node
/**
 * npm run test:pubs — scripts/pubs/check.mjs against recorded answers.
 *
 * The fixtures (scripts/pubs/fixtures/) are in the documented shapes of the
 * ORCID public API v3.0 (/works) and the Crossref REST API (/works?filter=orcid,
 * /works/{doi}), written by hand: the sandbox the script was written in could
 * not reach either service. They hold one case of everything the proposal
 * reports — a new DOI known only to ORCID (its metadata fetched from Crossref),
 * a year that differs, a title that differs, a submitted paper that now has a
 * DOI, a DOI not on ORCID — and cases that must NOT be reported: titles that
 * differ only in markup (MathML, <sup>), Unicode superscripts, case or
 * hyphenation, and a work without a DOI.
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { authorLine, normDoi, normTitle, proposal, run } from "./check.mjs"

let passed = 0
const test = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err.message}`)
    process.exitCode = 1
  }
}

const fixtures = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures")
const opts = { fixtures, publications: path.join(fixtures, "publications.yaml"), mailto: "", date: "2026-10-13" }
const before = fs.readFileSync(opts.publications, "utf8")
const { result, markdown, count } = await run(opts)

await test("normalising DOIs and titles", () => {
  assert.equal(normDoi("https://doi.org/10.1103/PhysRevC.107.L062801"), "10.1103/physrevc.107.l062801")
  assert.equal(normDoi("doi:10.1103/X"), "10.1103/x")
  assert.equal(normTitle("Complete ⁷Be evaluation"), normTitle("Complete <sup>7</sup>Be Evaluation"))
  assert.equal(normTitle("¹²C(p,γ)¹³N"), normTitle("<mml:math><mml:msup><mml:mn>12</mml:mn></mml:msup></mml:math>C(p,γ)13N"))
  assert.notEqual(normTitle("the 422 keV resonance"), normTitle("the 421 keV resonance"))
})

await test("a DOI known only to ORCID is proposed, with Crossref's metadata", () => {
  assert.equal(result.fresh.length, 1)
  const f = result.fresh[0]
  assert.equal(f.doi, "10.5555/test.new.2026")
  assert.equal(f.year, 2026)
  assert.equal(f.journal, "J. Test Fixt.")
  assert.deepEqual(f.sources, ["ORCID", "Crossref"])
  assert.match(markdown, /```yaml\n  - kind: article\n    authors: A\. Rossi, et al\.\n    title: "A fixture paper that publications\.yaml does not have"\n    journal: J\. Test Fixt\. 12, 100-110\n    doi: 10\.5555\/test\.new\.2026\n    year: 2026\n```/)
})

await test("a submitted paper with a new DOI of the same title is matched, not listed as new twice", () => {
  assert.equal(result.published.length, 1)
  assert.equal(result.published[0].doi, "10.5555/test.7be")
  assert.equal(result.published[0].status, "submitted to Physical Review C")
  assert.ok(!result.fresh.some((f) => f.doi === "10.5555/test.7be"))
})

await test("a year that differs is reported with its source", () => {
  assert.deepEqual(result.years, [{ doi: "10.1103/physrevc.111.035802", title: "A comparative analysis of R-matrix fitting: ¹²C(p,γ)¹³N as test case", yaml: 2025, found: 2024, source: "Crossref" }])
})

await test("a title that differs is reported; markup, case and superscripts are not", () => {
  assert.equal(result.titles.length, 1)
  assert.equal(result.titles[0].doi, "10.1103/physrevc.107.l062801")
  assert.match(result.titles[0].found, /421 keV/)
})

await test("a DOI in the YAML that ORCID and Crossref do not list is reported", () => {
  assert.deepEqual(result.missing.map((m) => m.doi), ["10.1016/j.nima.2026.171767"])
})

await test("the count and the proposal's sections", () => {
  assert.equal(count, result.fresh.length + result.years.length + result.titles.length + result.published.length)
  for (const h of ["## Submitted papers that now have a DOI (1)", "## New works", "## Years that differ (1)", "## Titles that differ (1)", "## In publications.yaml but not on ORCID"]) assert.ok(markdown.includes(h), h)
  assert.match(markdown, /Nothing has been changed/)
})

await test("nothing to report gives a short, clear proposal", () => {
  const empty = proposal({ fresh: [], years: [], titles: [], published: [], missing: [] }, { orcid: "0000-0001-7292-6353", date: "2026-10-13" })
  assert.equal(empty.count, 0)
  assert.match(empty.markdown, /Nothing to do/)
})

await test("author lines in the YAML's own form", () => {
  assert.equal(authorLine([{ given: "Jakub", family: "Skowronski" }, { given: "Richard James", family: "deBoer" }]), "J. Skowronski, R. J. deBoer")
  assert.equal(authorLine(Array.from({ length: 6 }, (_, i) => ({ given: "A", family: `N${i}` }))), "A. N0, et al.")
})

await test("the publications file is never written", () => {
  assert.equal(fs.readFileSync(opts.publications, "utf8"), before)
})

await test("a blocked network ends with status 2 and writes nothing", async () => {
  const { spawnSync } = await import("node:child_process")
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pubs-")), "p.md")
  // A closed local port stands for a blocked network, whatever the machine's own.
  const r = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), "check.mjs"), "--out", out], {
    cwd: process.cwd(),
    env: { ...process.env, PUBS_ORCID_API: "http://127.0.0.1:9/v3.0", PUBS_CROSSREF_API: "http://127.0.0.1:9" },
    encoding: "utf8",
    timeout: 60000,
  })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /could not reach|answered HTTP/)
  assert.ok(!fs.existsSync(out))
})

console.log(`\n${passed} passed`)
