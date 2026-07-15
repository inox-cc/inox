export {}

declare global {
  interface RegExp {
    test(value: string): boolean
  }
}
