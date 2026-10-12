/**
 * Saving what a plot shows: SVG and PNG of the chart(s) on screen, CSV of the
 * numbers behind them.
 *
 * The charts colour themselves with CSS custom properties (`var(--viz-…)`),
 * which mean nothing once the SVG leaves the page, so the export resolves
 * every one against the current theme before serialising.
 */

function resolveVars(svg: SVGSVGElement) {
  const style = getComputedStyle(document.documentElement)
  const resolve = (value: string) =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => style.getPropertyValue(name).trim() || "#000")
  for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    for (const attr of ["fill", "stroke", "color", "stop-color"]) {
      const v = el.getAttribute(attr)
      if (v && v.includes("var(")) el.setAttribute(attr, resolve(v))
    }
    const inline = el.getAttribute("style")
    if (inline && inline.includes("var(")) el.setAttribute("style", resolve(inline))
  }
}

/** One standalone SVG document holding `charts` stacked vertically. */
export function composeSvg(charts: SVGSVGElement[], title?: string): string {
  const style = getComputedStyle(document.documentElement)
  const background = style.getPropertyValue("--viz-surface").trim() || "#ffffff"
  const ink = style.getPropertyValue("--viz-text").trim() || "#000000"
  const gap = 12
  const top = title ? 28 : 8
  const width = Math.max(...charts.map((c) => c.width.baseVal.value || c.getBoundingClientRect().width))
  let y = top
  const parts: string[] = []
  for (const chart of charts) {
    const clone = chart.cloneNode(true) as SVGSVGElement
    resolveVars(clone)
    const h = chart.height.baseVal.value || chart.getBoundingClientRect().height
    clone.setAttribute("x", "0")
    clone.setAttribute("y", String(y))
    parts.push(new XMLSerializer().serializeToString(clone))
    y += h + gap
  }
  const height = y - gap + 8
  const heading = title
    ? `<text x="8" y="18" font-size="13" font-weight="600" fill="${ink}">${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`
    : ""
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `font-family="Inter, Helvetica, Arial, sans-serif">` +
    `<rect width="100%" height="100%" fill="${background}"/>${heading}${parts.join("")}</svg>`
  )
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadSvg(charts: SVGSVGElement[], filename: string, title?: string) {
  if (charts.length === 0) return
  save(new Blob([composeSvg(charts, title)], { type: "image/svg+xml" }), filename)
}

export function downloadPng(charts: SVGSVGElement[], filename: string, title?: string, scale = 2) {
  if (charts.length === 0) return
  const text = composeSvg(charts, title)
  const m = /width="([\d.]+)" height="([\d.]+)"/.exec(text)
  const width = Number(m?.[1] ?? 800)
  const height = Number(m?.[2] ?? 500)
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }))
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(scale, scale)
    ctx.drawImage(image, 0, 0, width, height)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => blob && save(blob, filename), "image/png")
  }
  image.src = url
}

export function downloadText(text: string, filename: string, type = "text/csv") {
  save(new Blob([text], { type }), filename)
}
