export {}

declare global {
  class Error {
    readonly name: string
    readonly message: string
    readonly code: string
    readonly cause: object | null

    constructor()
    constructor(message: string)
    constructor(message: string, options: { code?: string; cause?: object | null })
  }
}
