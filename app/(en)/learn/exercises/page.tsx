import { ExercisesPage, exercisesMetadata } from "@/components/pages/exercises"

export const metadata = exercisesMetadata("en")

export default function Page() {
  return <ExercisesPage lang={"en"} />
}
