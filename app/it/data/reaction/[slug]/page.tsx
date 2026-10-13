import { DataReactionPage, dataReactionMetadata, dataReactionParams } from "@/components/pages/data-reaction"

export const generateStaticParams = dataReactionParams

export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  return dataReactionMetadata((await params).slug, "it")
}

export default async function Page({ params }: Props) {
  return <DataReactionPage slug={(await params).slug} lang={"it"} />
}
