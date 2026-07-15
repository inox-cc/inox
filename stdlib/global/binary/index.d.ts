export {}

declare global {
  class Uint8Array {
    readonly length: number;
    [index: number]: number

    constructor(length: number)
    constructor(values: number[])

    slice(start: number, end?: number): Uint8Array
    toString(): string
  }
}
