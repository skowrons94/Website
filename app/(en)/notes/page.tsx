import { NotesPage, notesMetadata } from "@/components/pages/notes"

export const metadata = notesMetadata("en")

export default function Page() {
  return <NotesPage lang={"en"} />
}
