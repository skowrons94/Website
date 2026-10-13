import { RatesCuriosityPage, curiosityIds, curiosityMetadata } from "@/components/pages/rates-curiosities"
import { RouteLd } from "@/components/route-ld"

export const generateStaticParams = curiosityIds

export const dynamicParams = false

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return curiosityMetadata((await params).id, "en")
}

export default async function Page({ params }: Props) {
  return (
    <>
      <RatesCuriosityPage id={(await params).id} lang={"en"} />
      {/* --- find --- */}
      <RouteLd lang={"en"} page="curiosity" id={(await params).id} />
    </>
  )
}
