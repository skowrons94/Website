import { RatesCuriositiesPage, curiositiesMetadata } from "@/components/pages/rates-curiosities"
import { RouteLd } from "@/components/route-ld"

export const metadata = curiositiesMetadata("it")

export default function Page() {
  return (
    <>
      <RatesCuriositiesPage lang={"it"} />
      {/* --- find --- */}
      <RouteLd lang={"it"} page="curiosities" />
    </>
  )
}
