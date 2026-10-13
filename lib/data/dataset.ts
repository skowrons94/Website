/**
 * A shard's dataset at full resolution, its entry's fields merged into its
 * metadata: scripts/data/nucdata/store.py `full_dataset`, for the exports.
 *
 * `read(path)` returns a parsed file under public/data/exfor/ (a page, or a
 * decimated set's full points, `sets/<entry>/<id>.json.gz`, already
 * decompressed); the browser and the tests supply their own.
 */

import { pyMerge } from "./pyfmt.ts"
import type { FullDataset, Points, Shard, ShardDataset } from "./types.ts"

export type Reader = (path: string) => Promise<unknown>

export async function fullDataset(shard: Shard, ds: ShardDataset, read: Reader): Promise<FullDataset> {
  const entry = (shard.entries ?? {})[ds.meta.entry] ?? {}
  const out: FullDataset = {
    meta: pyMerge(entry, ds.meta) as FullDataset["meta"],
    points: ds.points,
    excluded: ds.excluded ?? [],
  }
  let decimated = ds.decimated
  if (ds.page) {
    const page = (await read(ds.page)) as { datasets: (ShardDataset & { id: string })[] }
    for (const d of page.datasets) {
      if (d.id === ds.meta.id) {
        out.points = d.points
        out.excluded = d.excluded
        if (d.decimated) decimated = d.decimated
      }
    }
  }
  if (decimated) {
    const full = (await read(decimated.full)) as { points: Points; excluded: unknown[] }
    out.points = full.points
    out.excluded = full.excluded
  }
  return out
}
