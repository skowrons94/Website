/**
 * Sparse LU without pivoting, for the matrices W = I − hγJ of a reaction
 * network. The fill pattern is found once (symbolic factorisation) for a
 * fixed ordering, then every step factors in place on that pattern.
 *
 * No pivoting is safe here: J's diagonal is negative (destruction) and its
 * columns are close to conservation, so W is diagonally dominant by columns
 * once weighted by mass number. Ordering decides the fill: a network whose
 * Jacobian is a band plus a few dense rows and columns (the s-process: the
 * captures along the valley, plus the neutron and the light nuclei that
 * touch everything) stays banded-and-bordered if those dense ones come last.
 */

export interface SparsePattern {
  n: number
  /** CSR row starts (length n + 1) */
  rowStart: Int32Array
  /** column of each stored entry, sorted within a row */
  col: Int32Array
  /** position of the diagonal in each row */
  diag: Int32Array
  /** position of (row, col), or −1 */
  find(row: number, col: number): number
}

/** The pattern of `entries` (row, col pairs) with every fill-in of an LU. */
export function symbolic(n: number, entries: Iterable<[number, number]>): SparsePattern {
  const rows: Set<number>[] = Array.from({ length: n }, (_, i) => new Set([i]))
  for (const [r, c] of entries) rows[r].add(c)
  const upper: Int32Array[] = new Array(n)
  const mark = new Uint8Array(n)
  const sorted: Int32Array[] = new Array(n)
  for (let i = 0; i < n; i++) {
    mark.fill(0)
    for (const c of rows[i]) mark[c] = 1
    // eliminate with every earlier row k present in row i: its upper part
    // joins row i (a k reached through fill is visited in turn, since the
    // scan goes up in k)
    for (let k = 0; k < i; k++) {
      if (!mark[k]) continue
      const u = upper[k]
      for (let q = 0; q < u.length; q++) mark[u[q]] = 1
    }
    const cols: number[] = []
    for (let c = 0; c < n; c++) if (mark[c]) cols.push(c)
    sorted[i] = Int32Array.from(cols)
    upper[i] = Int32Array.from(cols.filter((c) => c > i))
  }
  const rowStart = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) rowStart[i + 1] = rowStart[i] + sorted[i].length
  const col = new Int32Array(rowStart[n])
  const diag = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    col.set(sorted[i], rowStart[i])
    for (let p = rowStart[i]; p < rowStart[i + 1]; p++) if (col[p] === i) diag[i] = p
  }
  const find = (row: number, c: number) => {
    let lo = rowStart[row]
    let hi = rowStart[row + 1] - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (col[mid] === c) return mid
      if (col[mid] < c) lo = mid + 1
      else hi = mid - 1
    }
    return -1
  }
  return { n, rowStart, col, diag, find }
}

/** In-place LU of `val` (on `pat`): unit lower L below the diagonal, U on and above. */
export function factor(pat: SparsePattern, val: Float64Array, work: Float64Array): void {
  const { n, rowStart, col, diag } = pat
  for (let i = 0; i < n; i++) {
    const s = rowStart[i]
    const e = rowStart[i + 1]
    for (let p = s; p < e; p++) work[col[p]] = val[p]
    for (let p = s; p < diag[i]; p++) {
      const k = col[p]
      let piv = val[diag[k]]
      if (piv === 0) piv = 1e-300
      const l = work[k] / piv
      work[k] = l
      if (l === 0) continue
      const ke = rowStart[k + 1]
      for (let q = diag[k] + 1; q < ke; q++) work[col[q]] -= l * val[q]
    }
    for (let p = s; p < e; p++) {
      val[p] = work[col[p]]
      work[col[p]] = 0
    }
  }
}

/** Solves LU x = b in place (b becomes x). */
export function solve(pat: SparsePattern, val: Float64Array, b: Float64Array): void {
  const { n, rowStart, col, diag } = pat
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let p = rowStart[i]; p < diag[i]; p++) s -= val[p] * b[col[p]]
    b[i] = s
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    const e = rowStart[i + 1]
    for (let p = diag[i] + 1; p < e; p++) s -= val[p] * b[col[p]]
    b[i] = s / val[diag[i]]
  }
}
