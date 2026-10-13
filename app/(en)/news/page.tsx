import { NewsPage, newsMetadata } from "@/components/pages/news"

export const metadata = newsMetadata("en")

export default function Page() {
  return <NewsPage lang={"en"} />
}
