/**
 * A genuine .caendat file: the XDAQ file header CaenDAQ writes
 * (include/caendaq/DataFileHeader.hpp, buildXdaqHeader) followed by x730 board
 * aggregates in the layout of CaenDAQ's MockDigitizer.cpp and of the CAEN
 * manuals (UM5678 DPP-PHA, UM4380 DPP-PSD), little-endian, no trailer — so
 * RUReader converts it unchanged.
 *
 * Board aggregate: [0xA | length] [board id << 27 | FAIL << 26 | couple mask]
 *                  [aggregate counter] [aggregate time tag], then per couple:
 * [size] [format], and per event three words: time (CH bit 31, TS[30:0]),
 * extras (extended TS[31:16], flags), energy or charge word.
 * The format word enables Energy/Charge + TS + Extras with extras option 2
 * (extended time stamp [31:16], fine TS [9:0] = 0), so time stamps are 47 bit
 * and never roll over in a demo run. Traces are not included in the sample.
 */
import type { Replay, ReplayEvent } from './replay'
import { NS_PER_TICK } from './replay'

/** events.csv's first line (read it with comment='#', e.g. pandas.read_csv(..., comment='#')). */
export const SIMULATED_CSV = '# SIMULATED DATA — WebDAQ in-browser demo, not a measurement'

export const XDAQ_KEY = 0xfa0201a0
const TWO31 = 2 ** 31

export function boardDefWord(nsPerSample: number, nsPerTimetag: number, dpp: 'DPP-PHA' | 'DPP-PSD', channels: number, boardRegId: number) {
  return ((nsPerSample & 0x3f) | ((nsPerTimetag & 0x3f) << 6) | ((dpp === 'DPP-PSD' ? 1 : 0) << 12) |
    ((channels & 0xff) << 16) | ((boardRegId & 0xff) << 24)) >>> 0
}

/** Format word of a couple aggregate: Energy/Charge (30), TS (29), Extras (28), extras option 2 (bits 26:24). */
export const FORMAT_WORD = ((1 << 30) | (1 << 29) | (1 << 28) | (2 << 24)) >>> 0

function eventWords(e: ReplayEvent, dpp: 'DPP-PHA' | 'DPP-PSD'): [number, number, number] {
  const low = e.ts % TWO31
  const high = Math.floor(e.ts / TWO31) & 0xffff
  const time = (((e.ch & 1) << 31) | low) >>> 0
  if (dpp === 'DPP-PHA') {
    // Energy word: energy[14:0], PU[15], extras[20:16] (bit 4 of extras = input saturation).
    const word = ((e.a & 0x7fff) | ((e.pu ? 1 : 0) << 15) | ((e.satu ? 0x10 : 0) << 16)) >>> 0
    return [time, (high << 16) >>> 0, word]
  }
  // PSD extras option 2: extended TS[31:16], flags[15:10] (bit 14 = saturated), fine TS[9:0].
  const extras = ((high << 16) | (e.satu ? 0x4000 : 0)) >>> 0
  const word = ((e.a & 0x7fff) | ((e.pu ? 1 : 0) << 15) | ((e.b & 0xffff) << 16)) >>> 0
  return [time, extras, word]
}

export function writeCaendat(rep: Replay, epochStartS: number, channels = 16): Uint8Array {
  const words: number[] = [7, XDAQ_KEY, 1, 0, 0, epochStartS >>> 0, boardDefWord(2, NS_PER_TICK, rep.dpp, channels, rep.boardId)]
  let counter = 0
  for (const block of rep.blocks) {
    const byCouple = new Map<number, ReplayEvent[]>()
    for (const e of block) {
      const c = e.ch >> 1
      if (!byCouple.has(c)) byCouple.set(c, [])
      byCouple.get(c)!.push(e)
    }
    const couples = [...byCouple.keys()].sort((a, b) => a - b)
    let mask = 0
    for (const c of couples) mask |= 1 << c
    const start = words.length
    words.push(0, (((rep.boardId & 0x1f) << 27) | mask) >>> 0, counter & 0x7fffff, (block[0].ts % 2 ** 32) >>> 0)
    for (const c of couples) {
      const evs = byCouple.get(c)!
      words.push(2 + evs.length * 3, FORMAT_WORD)
      for (const e of evs) words.push(...eventWords(e, rep.dpp))
    }
    words[start] = (0xa0000000 | ((words.length - start) & 0x0fffffff)) >>> 0
    counter++
  }
  const out = new Uint8Array(words.length * 4)
  const dv = new DataView(out.buffer)
  words.forEach((w, i) => dv.setUint32(i * 4, w >>> 0, true))
  return out
}

/** events.csv: RUReader's tree columns, without ROOT (Timestamp in ps, as RUReader's default unit). */
export function writeEventsCsv(rep: Replay): string {
  const psd = rep.dpp === 'DPP-PSD'
  const lines = [SIMULATED_CSV, psd ? 'Board,Channel,Timestamp_ps,EnergyShort,EnergyLong,PU,SATU,LOST' : 'Board,Channel,Timestamp_ps,Energy,PU,SATU,LOST']
  for (const block of rep.blocks) {
    for (const e of block) {
      // ps from 2 ns ticks: exact in a double up to 2^53 ps (≈ 2.5 h).
      const ps = e.ts * NS_PER_TICK * 1000
      lines.push(psd
        ? `${rep.boardId},${e.ch},${ps},${e.a},${e.b},${e.pu ? 1 : 0},${e.satu ? 1 : 0},0`
        : `${rep.boardId},${e.ch},${ps},${e.a},${e.pu ? 1 : 0},${e.satu ? 1 : 0},0`)
    }
  }
  return lines.join('\n') + '\n'
}
