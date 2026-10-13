/**
 * A TypeScript port of the parts of RUReader (dec595b) that read a .caendat file:
 * the XDAQ header (RUReader.cc:430-497) and x730 board aggregates
 * (UnpackHeader, UnpackPHA, UnpackPSD): couple mask, couple size and format
 * word, CH bit, extras option 2 (extended time stamp), PU and saturation flags.
 */
export interface Decoded {
  hSize: number
  key: number
  boards: { nsPerSample: number; nsPerTimetag: number; dpp: number; channels: number; regId: number }[]
  epoch: number
  events: { board: number; ch: number; ts: number; a: number; b: number; pu: boolean; satu: boolean }[]
  aggregates: number
  corrupted: number
}

export function decodeCaendat(buf: Uint8Array): Decoded {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = buf.byteLength / 4
  const w = (i: number) => dv.getUint32(i * 4, true)
  const hSize = w(0)
  const nb = w(2)
  const boards = Array.from({ length: nb }, (_, i) => {
    const d = w(6 + i)
    return { nsPerSample: d & 0x3f, nsPerTimetag: (d >>> 6) & 0x3f, dpp: (d >>> 12) & 0xf, channels: (d >>> 16) & 0xff, regId: (d >>> 24) & 0xff }
  })
  const out: Decoded = { hSize, key: w(1), boards, epoch: w(5), events: [], aggregates: 0, corrupted: 0 }
  let pos = hSize
  while (pos < n) {
    if ((w(pos) >>> 28) !== 0xa) { out.corrupted++; break }
    const len = w(pos) & 0x0fffffff
    const board = (w(pos + 1) & 0xf8000000) >>> 27
    const mask = w(pos + 1) & 0xff
    const dpp = boards.find(b => b.regId === board)?.dpp ?? 0
    const end = pos + len
    let p = pos + 4
    for (let bit = 0; bit < 8; bit++) {
      if (!((mask >>> bit) & 1)) continue
      const size = dpp === 1 ? w(p) & 0x3fffff : w(p) & 0x7fffffff
      const fmt = w(p + 1)
      const hasExtras = ((fmt >>> 28) & 1) === 1
      const extrasMode = (fmt >>> 24) & 7
      const evtSize = 1 + 1 + (hasExtras ? 1 : 0)   // TS + energy/charge [+ extras]; no traces
      if (size < 2 || p + size > end) { out.corrupted++; break }
      const nEv = (size - 2) / evtSize
      for (let e = 0; e < nEv; e++) {
        const ev = p + 2 + e * evtSize
        const time = w(ev)
        const word = w(ev + evtSize - 1)
        const extras2 = hasExtras ? w(ev + evtSize - 2) : 0
        const ext = hasExtras && (extrasMode === 0 || extrasMode === 2 || (dpp === 1 && extrasMode === 1)) ? extras2 >>> 16 : 0
        const ts = ext * 2 ** 31 + (time & 0x7fffffff)
        const ch = ((time >>> 31) & 1) + bit * 2
        if (dpp === 0) {
          const extras = (word >>> 16) & 0x1f
          out.events.push({ board, ch, ts, a: word & 0x7fff, b: 0, pu: ((word >>> 15) & 1) === 1, satu: (extras & (0x10 | 0x80)) !== 0 })
        } else {
          out.events.push({ board, ch, ts, a: word & 0x7fff, b: word >>> 16, pu: ((word >>> 15) & 1) === 1, satu: (extras2 & 0x4000) !== 0 })
        }
      }
      p += size
    }
    out.aggregates++
    pos = end
  }
  return out
}
