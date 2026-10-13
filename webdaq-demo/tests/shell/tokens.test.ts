// The demo frame's tokens (shim/tokens.css) are the website's (app/globals.css), light and dark.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const SITE = path.join(HERE, '..', 'app', 'globals.css')
const NAMES = ['background', 'foreground', 'card', 'muted', 'muted-foreground', 'border', 'input-strong', 'link', 'ring', 'destructive']

function block(css: string, selector: RegExp): Record<string, string> {
  const m = selector.exec(css)
  if (!m) throw new Error(`no block ${selector}`)
  const body = css.slice(m.index + m[0].length, css.indexOf('}', m.index + m[0].length))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(x => [x[1], x[2].trim()]))
}

describe.skipIf(!fs.existsSync(SITE))('frame tokens', () => {
  it('match the site, light and dark', () => {
    const site = fs.readFileSync(SITE, 'utf8')
    const base = site.slice(site.indexOf('@layer base'))
    const siteLight = block(base, /:root\s*\{/)
    const siteDark = block(base, /\.dark\s*\{/)
    const demo = fs.readFileSync(path.join(HERE, 'shim', 'tokens.css'), 'utf8')
    const light = block(demo, /:root\s*\{/)
    const dark = block(demo, /\.dark\s*\{/)
    for (const n of NAMES) {
      expect(light[`wd-${n}`], `light ${n}`).toBe(siteLight[n])
      expect(dark[`wd-${n}`], `dark ${n}`).toBe(siteDark[n])
    }
  })
})
