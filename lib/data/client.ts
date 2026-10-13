/**
 * Fetching the data explorer's files in the browser, under the site's base
 * path: one reaction's shard (and its pages), a decimated set's full points
 * (gzipped, unpacked here), the mass table for the exports.
 */

import { fullDataset } from "./dataset.ts"
import type { MassTable as _M } from "./export.ts"
import { massTable } from "./masses.ts"
import { parsePy } from "./pyfmt.ts"
import type { FullDataset, Shard, ShardDataset } from "./types.ts"

export const BASE = process.env.BASE_PATH ?? ""
export const dataUrl = (path: string) => `${BASE}/data/${path}`

export interface LoadedShard {
  shard: Shard
  text: string
}

const shards = new Map<string, Promise<LoadedShard>>()

export class NotBuilt extends Error {}

/** A reaction's shard (memoised): parsed for the page, and its text kept for the exports. */
export function loadShard(slug: string): Promise<LoadedShard> {
  let p = shards.get(slug)
  if (!p) {
    p = fetch(dataUrl(`exfor/r/${encodeURIComponent(slug)}.json`)).then(async (r) => {
      if (r.status === 404) throw new NotBuilt(slug)
      if (!r.ok) throw new Error(`${r.status}`)
      const text = await r.text()
      return { shard: JSON.parse(text) as Shard, text }
    })
    p.catch(() => shards.delete(slug))
    shards.set(slug, p)
  }
  return p
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
  return await new Response(stream).text()
}

/** A file under data/exfor/ (a page or a gzipped full set), parsed keeping Python's floats. */
async function readExfor(path: string): Promise<unknown> {
  const r = await fetch(dataUrl(`exfor/${path}`))
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return parsePy(await gunzip(await r.arrayBuffer()))
}

/** A file under data/exfor/ parsed plainly (pages for the plot). */
export async function readExforPlain<T>(path: string): Promise<T> {
  const r = await fetch(dataUrl(`exfor/${path}`))
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return JSON.parse(await gunzip(await r.arrayBuffer())) as T
}

const pyShards = new Map<string, Shard>()

/** The datasets `ids` of a shard at full resolution, as dx.py export reads them. */
export async function fullDatasets(slug: string, ids: string[]): Promise<FullDataset[]> {
  const { text } = await loadShard(slug)
  let shard = pyShards.get(slug)
  if (!shard) {
    shard = parsePy(text) as Shard
    pyShards.set(slug, shard)
  }
  const want = new Set(ids)
  const sets: ShardDataset[] = shard.datasets.filter((d) => want.has(d.meta.id))
  // in the order asked
  sets.sort((a, b) => ids.indexOf(a.meta.id) - ids.indexOf(b.meta.id))
  return Promise.all(sets.map((d) => fullDataset(shard!, d, readExfor)))
}

let masses: Promise<_M> | null = null

/** The AME2020 mass excesses (app/(en)/data/reaction/masses.json). */
export function loadMasses(): Promise<_M> {
  masses ??= fetch(`${BASE}/data/reaction/masses.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`masses: ${r.status}`)
      return r.json() as Promise<Record<string, number>>
    })
    .then(massTable)
  masses.catch(() => {
    masses = null
  })
  return masses
}

export async function loadJournals(): Promise<Record<string, string>> {
  return (await import("./journals.json")).default as Record<string, string>
}

export function save(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
