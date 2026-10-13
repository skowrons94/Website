import { DataNucleusPage, dataNucleusMetadata, dataNucleusParams } from "@/components/pages/data-nucleus"

export const generateStaticParams = dataNucleusParams

export const dynamicParams = false

type Props = { params: Promise<{ nuclide: string }> }

export async function generateMetadata({ params }: Props) {
  return dataNucleusMetadata((await params).nuclide, "it")
}

export default async function Page({ params }: Props) {
  return <DataNucleusPage nuclide={(await params).nuclide} lang={"it"} />
}
