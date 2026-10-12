"use client"

import { createContext, useContext } from "react"

import type { Lang } from "@/lib/locale"

/**
 * The page's language, for client components deep in the tree (the map, the
 * timeline, the evaluation workspace). Server components take `lang` as a prop
 * instead; each root layout (`app/(en)`, `app/it`) sets this once.
 *
 * Kept apart from `useDict` (components/lang-provider.tsx), which needs the
 * dictionaries: the root layout renders this provider on every page, and
 * should not ship the dictionaries to a page whose components never ask.
 */
export const LangContext = createContext<Lang>("en")

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export const useLang = (): Lang => useContext(LangContext)
