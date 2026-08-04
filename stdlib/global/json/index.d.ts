export {}

declare global {
  interface JSON {
    parse(text: string): unknown
    stringify(value: unknown, replacer?: null, space?: number): string
  }

  const JSON: JSON
}
