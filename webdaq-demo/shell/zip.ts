// "Download all": the zip writer, in its own chunk (fflate's zipSync only).
import { zipSync } from 'fflate'

export function zipFiles(entries: Record<string, Uint8Array>): Uint8Array {
  // The marker lets scripts/size.mjs find this chunk in the export.
  ;(globalThis as Record<string, unknown>).__webdaqZip = true
  return zipSync(entries, { level: 6 })
}
