"use client"

import { useContext } from "react"

import { LangContext } from "@/components/lang-context"
import { dict, type Dictionary } from "@/lib/i18n"

/*
 * The language context lives in components/lang-context.tsx (which the root
 * layout uses, without the dictionaries); this module adds `useDict` for the
 * client components that need UI strings, and re-exports the rest so their
 * imports stay as they were.
 */
export { LangProvider, useLang } from "@/components/lang-context"

export const useDict = (): Dictionary => dict(useContext(LangContext))
