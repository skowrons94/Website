import { NewsPage, newsMetadata } from "@/components/pages/news"

export const metadata = newsMetadata("it")

export default function Page() {
  return <NewsPage lang={"it"} />
}
