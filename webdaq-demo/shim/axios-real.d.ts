// `axios-real` is a webpack alias for the real axios package (see overlay/next.config.mjs).
declare module 'axios-real' {
  export * from 'axios'
  import axios from 'axios'
  export default axios
}
