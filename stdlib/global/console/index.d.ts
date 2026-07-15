export {}

declare global {
  interface Console {
    log(...values: unknown[]): void
    info(...values: unknown[]): void
    warn(...values: unknown[]): void
    error(...values: unknown[]): void
  }

  const console: Console
}
