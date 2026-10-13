import { OpenQuestionsPage, openQuestionsMetadata } from "@/components/pages/open-questions"

export const metadata = openQuestionsMetadata("en")

export default function Page() {
  return <OpenQuestionsPage lang={"en"} />
}
