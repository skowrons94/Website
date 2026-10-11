import type { Metadata } from "next"

import { NotFoundBody } from "@/components/not-found-body"
import { dict } from "@/lib/i18n"

export const metadata: Metadata = { title: dict("it").notFound.title }

export default function NotFound() {
  return <NotFoundBody lang={"it"} />
}
