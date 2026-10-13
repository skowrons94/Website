import Link from "next/link"

import { localePath, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * A term linked to its glossary entry, with a dotted underline that reads as
 * "explained elsewhere" rather than as an ordinary link.
 */
export function Term({
  id,
  lang,
  children,
  className,
}: {
  id: string
  lang: Lang
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={localePath(lang, `/glossary#${id}`)}
      prefetch={false}
      className={cn(
        "underline decoration-muted-foreground/50 decoration-dotted underline-offset-[3px] transition-colors hover:text-link hover:decoration-current",
        className,
      )}
    >
      {children}
    </Link>
  )
}
