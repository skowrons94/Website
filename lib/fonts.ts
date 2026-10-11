import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google"

// Shared by both root layouts (English and Italian), so the two load the same
// font files and a switch of language does not refetch them.
export const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" })
export const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
})
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})
