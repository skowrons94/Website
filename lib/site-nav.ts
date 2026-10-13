/**
 * The site map, in one place: the header's bar and menus (and its phone menu)
 * and the footer's columns are both built from these groups, so the two list
 * the same pages in the same order. Plain data and a pure function, so the
 * header (a client component) can use it with the strings it is handed.
 *
 * The stories and the guided paths are part of the atlas: they sit right
 * under it in "Explore" and live on /atlas (#stories, #paths). The guided
 * paths keep their address, /data/path/<id>.
 */
export type NavKey =
  | "research"
  | "publications"
  | "software"
  | "cv"
  | "atlas"
  | "stories"
  | "data"
  | "rates"
  | "evaluations"
  | "notes"
  | "glossary"
  | "exercises"
  | "methods"
  | "timeline"
  | "sProcess"
  | "openQuestions"
  | "curiosities"

export const NAV_GROUPS: { id: "work" | "explore" | "learn"; items: { key: NavKey; path: string }[] }[] = [
  {
    id: "work",
    items: [
      { key: "research", path: "/research" },
      { key: "publications", path: "/publications" },
      { key: "software", path: "/software" },
      { key: "cv", path: "/cv" },
    ],
  },
  {
    id: "explore",
    items: [
      { key: "atlas", path: "/atlas" },
      { key: "stories", path: "/atlas#stories" },
      { key: "data", path: "/data" },
      { key: "rates", path: "/atlas/rates" },
      { key: "evaluations", path: "/evaluations" },
    ],
  },
  {
    id: "learn",
    items: [
      { key: "notes", path: "/notes" },
      { key: "glossary", path: "/glossary" },
      { key: "exercises", path: "/learn/exercises" },
      { key: "methods", path: "/atlas/methods" },
      { key: "timeline", path: "/atlas/timeline" },
      { key: "sProcess", path: "/atlas/s-process" },
      { key: "openQuestions", path: "/atlas/open-questions" },
      { key: "curiosities", path: "/atlas/rates/curiosities" },
    ],
  },
]

/** The nav strings an item needs: its label and its one-line description. */
type NavStrings = {
  research: string
  publications: string
  software: string
  cv: string
  atlas: string
  stories: string
  storiesDescription: string
  data: string
  dataDescription: string
  rates: string
  ratesDescription: string
  evaluations: string
  notes: string
  glossary: string
  exercises: string
  exercisesDescription: string
  methods: string
  timeline: string
  sProcess: string
  openQuestions: string
  openQuestionsDescription: string
  curiosities: string
  curiositiesDescription: string
  descriptions: Record<"research" | "atlas" | "evaluations" | "publications" | "cv" | "software" | "notes" | "glossary" | "methods" | "timeline" | "sProcess", string>
}

export function navLabel(nav: NavStrings, key: NavKey): { label: string; description: string } {
  const d = nav.descriptions
  switch (key) {
    case "stories":
      return { label: nav.stories, description: nav.storiesDescription }
    case "data":
      return { label: nav.data, description: nav.dataDescription }
    case "rates":
      return { label: nav.rates, description: nav.ratesDescription }
    case "exercises":
      return { label: nav.exercises, description: nav.exercisesDescription }
    case "openQuestions":
      return { label: nav.openQuestions, description: nav.openQuestionsDescription }
    case "curiosities":
      return { label: nav.curiosities, description: nav.curiositiesDescription }
    default:
      return { label: nav[key], description: d[key] }
  }
}
