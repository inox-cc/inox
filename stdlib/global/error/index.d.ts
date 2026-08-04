export {}

declare global {
  interface ErrorOptions {
    cause?: unknown
  }

  class Error {
    readonly name: string
    readonly message: string
    readonly cause: unknown

    constructor(message?: string, options?: ErrorOptions)
  }
}
