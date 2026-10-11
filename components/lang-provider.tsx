"use client"

import { createContext, useContext } from "react"

import { dict, type Dictionary, type Lang } from "@/lib/i18n"

/**
 * The page's language, for client components deep in the tree (the map, the
 * timeline, the evaluation workspace). Server components take `lang` as a prop
 * instead; each root layout (`app/(en)`, `app/it`) sets this once.
 */
const LangContext = createContext<Lang>("en")

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export const useLang = (): Lang => useContext(LangContext)

export const useDict = (): Dictionary => dict(useContext(LangContext))
