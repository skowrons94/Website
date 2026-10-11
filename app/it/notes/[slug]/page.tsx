import { NotePage, noteMetadata, noteParams } from "@/components/pages/note"

export const generateStaticParams = noteParams

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  return noteMetadata((await params).slug, "it")
}

export default async function Page({ params }: Props) {
  return <NotePage slug={(await params).slug} lang={"it"} />
}
