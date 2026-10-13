import { RatesCuriositiesPage, curiositiesMetadata } from "@/components/pages/rates-curiosities"
import { RouteLd } from "@/components/route-ld"

export const metadata = curiositiesMetadata("en")

export default function Page() {
  return (
    <>
      <RatesCuriositiesPage lang={"en"} />
      {/* --- find --- */}
      <RouteLd lang={"en"} page="curiosities" />
    </>
  )
}
