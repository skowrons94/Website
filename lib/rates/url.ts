/**
 * A setting of the explorers as an address, so a link opens the exact run:
 *
 *   /atlas/rates#cno&site=nova&s=N14_p_to_O15_reaclib:2
 *   /atlas/rates/s-process#site=massive-he-core&s=Mg25_n_to_Mg26_reaclib:2
 *
 * The first part without "=" names the network (the s-process page has one).
 */

export interface RatesAddress {
  net: string
  site: string | null
  scale: Record<string, number>
  luna: boolean
}

export function parseRatesHash(h: string): RatesAddress {
  const parts = h.replace(/^#/, "").split("&").filter(Boolean)
  const net = parts[0] && !parts[0].includes("=") ? parts.shift()! : ""
  const params = new Map(parts.map((p) => p.split("=") as [string, string]))
  const scale: Record<string, number> = {}
  for (const pair of (params.get("s") ?? "").split(",").filter(Boolean)) {
    const [id, f] = pair.split(":")
    const v = Number(f)
    if (id && v > 0 && v !== 1) scale[decodeURIComponent(id)] = Math.min(10, Math.max(0.1, v))
  }
  return { net, site: params.get("site") ?? null, scale, luna: params.get("luna") === "1" }
}

/** The address of a setting; `site` left out when it is the network's first. */
export function ratesHash(a: { net?: string; site?: string | null; scale?: Record<string, number>; luna?: boolean }): string {
  const s = Object.entries(a.scale ?? {})
    .filter(([, v]) => v !== 1)
    .map(([id, v]) => `${id}:${v}`)
    .join(",")
  const parts = [a.net || "", a.site ? `site=${a.site}` : "", s ? `s=${s}` : "", a.luna ? "luna=1" : ""].filter(Boolean)
  return parts.length ? `#${parts.join("&")}` : ""
}
