import { EvaluationPage, evaluationMetadata, evaluationParams } from "@/components/pages/evaluation"

export const generateStaticParams = evaluationParams
// Only the evaluations in this build's tree: any other id is a real 404 (status,
// title and page from the server), in the static export and on the server alike.
export const dynamicParams = false

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return evaluationMetadata((await params).id, "it")
}

export default async function Page({ params }: Props) {
  return <EvaluationPage id={(await params).id} lang={"it"} />
}
