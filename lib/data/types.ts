/**
 * The data explorer's files under public/data (scripts/data/README.md is the
 * reference): meta.json, exfor/index.json, exfor/r/<slug>.json (shards) and
 * ensdf/<nuclide>.json. Only the fields the pages read are typed strictly.
 */

export interface DxMeta {
  schema: "dx-meta"
  exfor: {
    snapshot_date: string
    commit: string
    license: string
    license_url: string
    entry_url: string
    master_url: string
    line: string
    line_it: string
    changes: string
    citation: string
    repository: string
  }
  masses: { name: string; citation: string }
  ensdf: { name: string; citation: string; archive_date: string }
  flags: {
    bits: string[]
    err_bits: string[]
    quantity_classes: Record<string, string>
    frames: (string | null)[]
  }
}

export interface DxIndex {
  schema: "dx-exfor-index"
  snapshot: { commit: string; date: string }
  reactions: { key: string[]; slug: string[]; n: number[]; atlas: string[][] }
  strings: { quantities: string[]; authors: string[]; institutes: string[]; facilities: string[] }
  columns: string[]
  datasets: {
    id: string[]
    r: number[]
    q: number[]
    qs: number[]
    fr: number[]
    e0: (number | null)[]
    e1: (number | null)[]
    k0: (number | null)[]
    k1: (number | null)[]
    n: number[]
    y: (number | null)[]
    a: number[]
    i: number[]
    fa: number[]
    f: number[]
    er: number[]
    lv: number[]
    s: number[]
    u: string[]
    /** lowest E_cm (MeV) of a measured point at 1 and 2 standard deviations (lib/data/lowest.mjs) */
    m1?: (number | null)[]
    m2?: (number | null)[]
  }
}

export interface ErrComponent {
  name: string
  kind: "stat" | "sys" | "total" | "digitising" | string
  where: "point" | "common" | string
  unit: string | null
  relative?: boolean
  value?: number | null
  text?: string | null
}

export interface ShardEntry {
  authors: string[]
  first_author: string
  title: string | null
  refs: { code: string; type: string; journal?: string; year?: number; doi?: string; note?: string }[]
  doi: string | null
  institutes: { code: string; name: string }[]
  facility: { code: string; name: string; institute: string; text: string }[]
  methods: string[]
  detectors: string[]
  entry_date: string | null
  entry_updated: string | null
  entry_revisions: number
  year: number | null
  links: { exfor: string; master: string }
  [key: string]: unknown
}

export interface DatasetMeta {
  id: string
  entry: string
  subentry: string
  pointer: string
  code: string
  sf: string[][]
  complex: boolean
  reaction: string
  target: string
  projectile: string
  process: string
  product: string
  compound: string
  quantity: string
  quantity_class: string
  quantity_text: string | null
  E_frame: string | null
  E_source: string | null
  ang_frame: string | null
  value_frame: string | null
  value_unit: string | null
  cm_approx: boolean
  emin_cm: number | null
  emax_cm: number | null
  emin_lab: number | null
  emax_lab: number | null
  kt_min: number | null
  kt_max: number | null
  npts: number
  nexcluded: number
  final_levels: number[]
  level_heading: string | null
  err_components: ErrComponent[]
  d_tot_source: string | null
  err_columns: Record<string, string>
  monitor: { code: string; text: string }[]
  flags: string[]
  /** curated corrections applied (scripts/data/corrections.yaml) */
  corrections?: { id: string; problem: string; change: string; status: string; reported_to_nrdc: string }[]
  threshold_cm?: number
  measured_min_cm?: Record<string, number | null>
  flag_texts: Record<string, string>
  status: { code: string; ref: string; text: string }[]
  superseded_by: string | null
  history: unknown[]
  subentry_date: string | null
  slices: string[]
  [key: string]: unknown
}

export interface Points {
  E_lab: (number | null)[]
  E_cm: (number | null)[]
  value: (number | null)[]
  dE?: (number | null)[]
  kT?: (number | null)[]
  ang?: (number | null)[]
  E_level?: (number | null)[]
  level_number?: (number | null)[]
  limit?: (string | null)[]
  d_stat?: (number | null)[]
  d_sys?: (number | null)[]
  d_tot?: (number | null)[]
  flag?: (number | null)[]
  err?: Record<string, (number | null)[]>
}

export interface ShardDataset {
  meta: DatasetMeta
  points: Points
  excluded: unknown[]
  decimated?: { total: number; kept: number; full: string }
  page?: string
}

export interface Shard {
  schema: "dx-exfor-shard"
  reaction: { key: string; slug: string; target: string; projectile: string; process: string; compound: string; atlas: string[] }
  entries: Record<string, ShardEntry>
  datasets: ShardDataset[]
  pages?: string[]
}

/** A dataset with its entry's fields merged in, at full resolution (store.find). */
export interface FullDataset {
  meta: DatasetMeta & ShardEntry
  points: Points
  excluded: unknown[]
}

export interface EnsdfGamma {
  E_keV: number
  dE_keV?: number
  I?: number
  dI?: number
  I_limit?: string
  BR?: number
  M?: string
  delta?: number
  d_delta?: number
  E_final_keV?: number
  questionable?: boolean
}

export interface EnsdfLevel {
  E_keV: number
  dE_keV?: number
  dE_text?: string
  E_text?: string
  J?: string
  firm?: boolean
  T?: string
  text?: string
  t_half_s?: number
  dt_half_s?: number
  width_eV?: number
  dwidth_eV?: number
  limit?: string
  decay?: Record<string, string>
  widths?: Record<string, string>
  L?: string
  questionable?: boolean
  isomer?: boolean
  gammas?: EnsdfGamma[]
}

export interface Ensdf {
  nuclide: string
  Z: number
  A: number
  separation: { S_n: number | null; S_p: number | null; S_a: number | null; unit: string; source: string }
  ensdf: {
    nucid: string
    dsid: string
    date: string
    evaluation: { authors: string; citation: string; cutoff: string; type: string }
    Q?: Record<string, number | string>
    levels: EnsdfLevel[]
  } | null
}
