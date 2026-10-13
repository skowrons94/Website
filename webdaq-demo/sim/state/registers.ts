/**
 * The simulated V1730's register file: the same register set, names and JSON
 * shape as WebDAQ's test-mode defaults (server/app/utils/board_defaults.py, after
 * CAEN UM5678 rev.3 for DPP-PHA and UM4380 rev.6 for DPP-PSD), the online-safe
 * lists (utils/safe_registers.py) and the board identity reported to the UI.
 */
import type { Dpp } from '../physics/api'

export interface RegEntry { name: string; channel: number; address: string; value: string }
export type RegFile = Record<string, RegEntry>
export interface BoardConfigFile {
  dgtzs: { BoardName: string; NbChannels: string; BoardNb: string; Firmware: string }
  registers: RegFile
}

const PER_CHANNEL_LIMIT = 0x2000
const STRIDE = 0x100
const MANDATORY_BOARD_CONFIG = (1 << 4) | (1 << 8) | (1 << 18) | (1 << 19)

type Def = [number, string, number | null]

const PHA: Def[] = [
  [0x1020, 'Record Length', 500],
  [0x1028, 'Input Dynamic Range', 0],
  [0x1034, 'Number of Events per Aggregate', 10],
  [0x1038, 'Pre Trigger', 100],
  [0x1054, 'RC-CR2 Smoothing Factor', 0x4],
  [0x1058, 'Input Rise Time', 6],
  [0x105C, 'Trapezoid Rise Time', 50],
  [0x1060, 'Trapezoid Flat Top', 25],
  [0x1064, 'Peaking Time', 12],
  [0x1068, 'Decay Time', 500],
  [0x106C, 'Trigger Threshold', 100],
  [0x1070, 'Rise Time Validation Window', 0],
  [0x1074, 'Trigger Hold-Off Width', 100],
  [0x1078, 'Peak Hold-Off', 100],
  [0x1080, 'DPP Algorithm Control', 0x400004],
  [0x1084, 'Shaped Trigger Width', 10],
  [0x1098, 'DC Offset', 0x8000],
  [0x10A0, 'DPP Algorithm Control 2', 0x0],
  [0x10C4, 'Fine Gain', 0x1000],
  [0x10D4, 'Veto Width', 0],
  [0x8000, 'Board Configuration', MANDATORY_BOARD_CONFIG],
  [0x800C, 'Aggregate Configuration', 0],
  [0x8100, 'Acquisition Control', 0x0],
  [0x810C, 'Global Trigger Mask', 0],
  [0x8110, 'Front Panel TRG-OUT Enable Mask', 0],
  [0x811C, 'Front Panel I/O Control', 0],
  [0x8120, 'Channel Enable Mask', null],
  [0x8170, 'Run/Start/Stop Delay', 0],
  [0x817C, 'Disable External Trigger', 0],
  [0x81C4, 'Extended Veto Delay', 0],
  [0xEF08, 'Board ID', null],
  [0xEF1C, 'Aggregate Number per BLT', 1000],
]

const PSD: Def[] = [
  [0x1020, 'Record Length', 500],
  [0x1028, 'Input Dynamic Range', 0],
  [0x1034, 'Number of Events per Aggregate', 10],
  [0x1038, 'Pre Trigger', 100],
  [0x103C, 'CFD Settings', 0],
  [0x1044, 'Charge Zero Suppression Threshold', 0],
  [0x1054, 'Short Gate', 20],
  [0x1058, 'Long Gate', 100],
  [0x105C, 'Gate Offset', 10],
  [0x1060, 'Trigger Threshold', 100],
  [0x1064, 'Fixed Baseline', 0],
  [0x106C, 'Trigger Latency', 0],
  [0x1070, 'Shaped Trigger Width', 10],
  [0x1074, 'Trigger Hold-Off Width', 100],
  [0x1078, 'Threshold for the PSD', 100],
  [0x107C, 'PUR-GAP Threshold', 100],
  [0x1080, 'DPP Algorithm Control', 0x400000],
  [0x1084, 'DPP Algorithm Control 2', 0x0],
  [0x1098, 'DC Offset', 0x8000],
  [0x10D4, 'Veto Width', 0],
  [0x10D8, 'Early Baseline Freeze', 0],
  [0x8000, 'Board Configuration', MANDATORY_BOARD_CONFIG],
  [0x800C, 'Aggregate Configuration', 0],
  [0x8100, 'Acquisition Control', 0x0],
  [0x810C, 'Global Trigger Mask', 0],
  [0x8110, 'Front Panel TRG-OUT Enable Mask', 0],
  [0x811C, 'Front Panel I/O Control', 0],
  [0x8120, 'Channel Enable Mask', null],
  [0x8170, 'Run/Start/Stop Delay', 0],
  [0x817C, 'Disable External Trigger', 0],
  [0x81C4, 'Extended Veto Delay', 0],
  [0xEF08, 'Board ID', null],
  [0xEF1C, 'Aggregate Number per BLT', 1000],
]

export const hex4 = (a: number) => a.toString(16).toUpperCase().padStart(4, '0')
/** Python's hex(): lower case, no padding. What the server writes on an edit. */
export const pyHex = (v: number) => (v < 0 ? '-0x' + (-v).toString(16) : '0x' + v.toString(16))

/** default_board_config() of board_defaults.py. */
export function defaultBoardConfig(name: string, boardId: number, dpp: Dpp, channels: number): BoardConfigFile {
  const defs = dpp === 'DPP-PHA' ? PHA : PSD
  const registers: RegFile = {}
  for (const [address, regName, v0] of defs) {
    let value = v0 ?? 0
    if (regName === 'Channel Enable Mask') value = channels >= 32 ? 0xffffffff : (1 << channels) - 1
    else if (regName === 'Board ID') value = boardId
    const entry = (addr: number, ch: number): RegEntry =>
      ({ name: regName, channel: ch, address: `0x${hex4(addr)}`, value: `0x${(value >>> 0).toString(16).toUpperCase()}` })
    if (address < PER_CHANNEL_LIMIT) {
      for (let c = 0; c < channels; c++) {
        const addr = address + c * STRIDE
        registers[`reg_${hex4(addr)}`] = entry(addr, c)
      }
    } else {
      registers[`reg_${hex4(address)}`] = entry(address, 0)
    }
  }
  return {
    dgtzs: { BoardName: name, NbChannels: String(channels), BoardNb: String(boardId), Firmware: 'sim' },
    registers,
  }
}

export function regValue(regs: RegFile, addr: number): number {
  const e = regs[`reg_${hex4(addr)}`]
  if (!e) return 0
  const v = parseInt(e.value, 16)
  return Number.isFinite(v) ? v >>> 0 : 0
}

export function setRegValue(regs: RegFile, addr: number, value: number) {
  const e = regs[`reg_${hex4(addr)}`]
  if (e) e.value = pyHex(value >>> 0)
}

// ── online-safe registers (safe_registers.py) ──────────────────────────────

export const SAFE_PHA: Record<number, string> = {
  0x1054: 'RC-CR2 Smoothing Factor', 0x1058: 'Input Rise Time', 0x105C: 'Trapezoid Rise Time',
  0x1060: 'Trapezoid Flat Top', 0x1064: 'Peaking Time', 0x1068: 'Decay Time',
  0x106C: 'Trigger Threshold', 0x1070: 'Rise Time Validation Window', 0x1074: 'Trigger Hold-Off Width',
  0x1078: 'Peak Hold-Off', 0x1080: 'DPP Algorithm Control', 0x1084: 'Shaped Trigger Width',
  0x1098: 'DC Offset', 0x10A0: 'DPP Algorithm Control 2', 0x10C4: 'Fine Gain', 0x10D4: 'Veto Width',
}
export const SAFE_PSD: Record<number, string> = {
  0x103C: 'CFD Settings', 0x1044: 'Charge Zero Suppression Threshold', 0x1054: 'Short Gate',
  0x1058: 'Long Gate', 0x105C: 'Gate Offset', 0x1060: 'Trigger Threshold', 0x1064: 'Fixed Baseline',
  0x106C: 'Trigger Latency', 0x1070: 'Shaped Trigger Width', 0x1074: 'Trigger Hold-Off Width',
  0x1078: 'Threshold for the PSD', 0x107C: 'PUR-GAP Threshold', 0x1080: 'DPP Algorithm Control',
  0x1084: 'DPP Algorithm Control 2', 0x1098: 'DC Offset', 0x10D4: 'Veto Width', 0x10D8: 'Early Baseline Freeze',
}
const STRUCTURAL: Record<number, string> = {
  0x1020: 'Record Length', 0x1028: 'Input Dynamic Range', 0x1034: 'Number of Events per Aggregate',
  0x1038: 'Pre Trigger', 0x8000: 'Board Configuration', 0x800C: 'Aggregate Configuration',
  0x8100: 'Acquisition Control', 0x810C: 'Global Trigger Mask', 0x8110: 'Front Panel TRG-OUT Enable Mask',
  0x811C: 'Front Panel I/O Control', 0x8120: 'Channel Enable Mask', 0x8170: 'Run/Start/Stop Delay',
  0x817C: 'Disable External Trigger', 0x81C4: 'Extended Veto Delay', 0xEF08: 'Board ID',
  0xEF1C: 'Aggregate Number per BLT',
}

export const channelBase = (a: number) => (a >= 0x1000 && a <= 0x1fff ? a & 0xf0ff : a)

export function isOnlineSafe(address: number, dpp: string): [boolean, string] {
  const base = channelBase(address)
  const isPha = dpp.toUpperCase().endsWith('PHA')
  const safe = isPha ? SAFE_PHA : SAFE_PSD
  if (base in safe) return [true, '']
  if (base in STRUCTURAL) {
    return [false, `${STRUCTURAL[base]} defines how the readout is organised, so it cannot be ` +
      'changed while the board is acquiring. It has been saved to the configuration ' +
      'and will take effect at the next run.']
  }
  const other = isPha ? SAFE_PSD : SAFE_PHA
  if (base in other) {
    return [false, `Register 0x${hex4(base)} is not a ${isPha ? 'DPP-PHA' : 'DPP-PSD'} parameter, so it is not written to ` +
      'the board. The configuration has been saved.']
  }
  return [false, `Register 0x${hex4(base)} is not on the list of parameters that are safe to change ` +
    'on a live board. The configuration has been saved and applies at the next run.']
}

export function safeRegisterNames(dpp: string): Record<string, string> {
  const safe = dpp.toUpperCase().endsWith('PHA') ? SAFE_PHA : SAFE_PSD
  const out: Record<string, string> = {}
  for (const [a, n] of Object.entries(safe)) out[`0x${hex4(Number(a))}`] = n
  return out
}

export const START_MODE_NAMES: Record<number, string> = {
  0: 'SW controlled', 1: 'S-IN/GPI controlled', 2: 'First trigger controlled', 3: 'LVDS controlled',
}
