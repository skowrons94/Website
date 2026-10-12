"use client"

import { useLang } from "@/components/lang-context"
import { evalDict, type EvalDictionary } from "@/lib/i18n-eval"

/** The evaluation pages' strings in the page's language (lib/i18n-eval.ts). */
export const useEvalDict = (): EvalDictionary => evalDict(useLang())
