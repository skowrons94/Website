import { NotesPage, notesMetadata } from "@/components/pages/notes"

export const metadata = notesMetadata("it")

export default function Page() {
  return <NotesPage lang={"it"} />
}
