import { TimelinePage, timelineMetadata } from "@/components/pages/timeline"

export const metadata = timelineMetadata("en")

export default function Page() {
  return <TimelinePage lang={"en"} />
}
