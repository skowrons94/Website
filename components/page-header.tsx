export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string
  title: string
  lead?: string
}) {
  return (
    <div className="mb-12 border-b border-border/70 pb-8">
      {eyebrow && (
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h1 className="hyphens-auto font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      {lead && (
        <p className="mt-4 max-w-2xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
          {lead}
        </p>
      )}
    </div>
  )
}

/**
 * Standard page frame.
 *
 * Two widths, both of which grow on large screens rather than leaving the
 * viewport mostly margin: `wide` is for list and timeline layouts (publications,
 * CV), which read better the more room they get; the default is for pages with
 * a single column of running text, where the measure is capped so lines do not
 * grow past comfortable reading length.
 */
export function Container({
  children,
  wide = false,
}: {
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className={`mx-auto px-5 py-14 sm:px-8 ${
        wide
          ? "max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
          : "max-w-4xl xl:max-w-5xl"
      }`}
    >
      {children}
    </div>
  )
}
