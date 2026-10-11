import { ReactionPage, reactionMetadata, reactionParams } from "@/components/pages/reaction"

export const generateStaticParams = reactionParams

export const dynamicParams = false

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return reactionMetadata((await params).id, "en")
}

export default async function Page({ params }: Props) {
  return <ReactionPage id={(await params).id} lang={"en"} />
}
