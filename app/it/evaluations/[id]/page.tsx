import { EvaluationPage, evaluationMetadata, evaluationParams } from "@/components/pages/evaluation"

export const generateStaticParams = evaluationParams

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  return evaluationMetadata((await params).id, "it")
}

export default async function Page({ params }: Props) {
  return <EvaluationPage id={(await params).id} lang={"it"} />
}
