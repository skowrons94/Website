import { notFound } from "next/navigation"

import { DataPathPage, dataPathIds, dataPathMetadata } from "@/components/pages/data-path"
import { PATH_IDS, type PathId } from "@/lib/data/paths"

export const generateStaticParams = dataPathIds

export const dynamicParams = false

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return dataPathMetadata((await params).id, "it")
}

export default async function Page({ params }: Props) {
  const { id } = await params
  if (!(PATH_IDS as readonly string[]).includes(id)) notFound()
  return <DataPathPage id={id as PathId} lang={"it"} />
}
