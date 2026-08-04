export {}

declare global {
  interface Number {
    toString(radix?: number): string
  }

  interface String {
    readonly length: number
    readonly [index: number]: string

    at(index: number): string | undefined
    charAt(index: number): string
    charCodeAt(index: number): number
    concat(...values: string[]): string
    endsWith(value: string, endPosition?: number): boolean
    includes(value: string, position?: number): boolean
    indexOf(value: string, position?: number): number
    lastIndexOf(value: string, position?: number): number
    padEnd(targetLength: number, pad?: string): string
    padStart(targetLength: number, pad?: string): string
    repeat(count: number): string
    replace(searchValue: string, replaceValue: string): string
    replaceAll(searchValue: string, replaceValue: string): string
    slice(start?: number, end?: number): string
    split(separator?: string, limit?: number): Array<string>
    startsWith(value: string, position?: number): boolean
    substring(start: number, end?: number): string
    toLowerCase(): string
    toUpperCase(): string
    trim(): string
    trimEnd(): string
    trimLeft(): string
    trimRight(): string
    trimStart(): string
  }
}
