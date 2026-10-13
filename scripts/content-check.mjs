/**
 * The site's own YAML (content/*.yaml): every list item meant as a line of
 * text must be text. YAML reads an unquoted "Topic: text" item as a mapping,
 * which only fails at build time, as an error far from its cause ("a.replace
 * is not a function" on /cv). Run by `npm run check:content`, the prebuild and
 * the Checks workflow.
 */
import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"

const DIR = path.join(process.cwd(), "content")
const problems = []

function walk(node, where, file) {
  if (Array.isArray(node)) {
    const strings = node.filter((x) => typeof x === "string").length
    node.forEach((item, i) => {
      // A list that is mostly text and has a non-text item: almost certainly
      // an unquoted "Topic: text" line.
      if (strings > 0 && typeof item !== "string" && item !== null && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 1) {
        const [k, v] = Object.entries(item)[0]
        problems.push(`${file}: ${where}[${i}] is read as "${k}: ${v}" (a mapping), not text. Quote the line or rephrase it without ": ".`)
      }
      walk(item, `${where}[${i}]`, file)
    })
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, where ? `${where}.${k}` : k, file)
  }
}

for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith(".yaml")).sort()) {
  walk(yaml.load(fs.readFileSync(path.join(DIR, name), "utf8")), "", `content/${name}`)
}

if (problems.length) {
  console.error(problems.join("\n"))
  process.exit(1)
}
if (!process.argv.includes("--quiet")) console.log("content check passed")
