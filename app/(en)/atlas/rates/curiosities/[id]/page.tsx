import { RatesCuriosityPage, curiosityIds, curiosityMetadata } from "@/components/pages/rates-curiosities"

export const generateStaticParams = curiosityIds

export const dynamicParams = false

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return curiosityMetadata((await params).id, "en")
}

export default async function Page({ params }: Props) {
  return <RatesCuriosityPage id={(await params).id} lang={"en"} />
}
