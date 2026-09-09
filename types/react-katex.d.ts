// react-katex ships no type declarations; these are the two components used here.
declare module "react-katex" {
  import type { ComponentType } from "react"

  interface KatexProps {
    math: string
    errorColor?: string
    renderError?: (error: Error) => JSX.Element
    settings?: Record<string, unknown>
  }

  export const InlineMath: ComponentType<KatexProps>
  export const BlockMath: ComponentType<KatexProps>
}
