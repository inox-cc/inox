# Strings

Inox stores strings as UTF-8. The public API uses JavaScript-compatible UTF-16
positions where a numeric string position is required, while operations never
produce invalid UTF-8 fragments.

Supported API:

```ts
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
  split(separator?: string, limit?: number): string[]
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
```

Intentional differences from JavaScript:

- `charCodeAt()` returns `0` outside the string because Inox does not currently
  expose `NaN`.
- `split('')`, `slice()` and related boundary operations preserve Unicode code
  points instead of exposing isolated UTF-16 surrogate halves.
- `toLowerCase()` and `toUpperCase()` currently transform ASCII letters only.
- non-string arguments are not implicitly coerced.

`trim()` recognizes ECMAScript Unicode whitespace. `split()` supports omitted
separator and a numeric limit. `concat()` accepts any number of strings.
`replace()` and `replaceAll()` support string search/replacement values and the
standard `$$`, `$&`, ``$` `` and `$'` replacement patterns. RegExp and callback
overloads are not part of the current contract.

Generated C++ uses the `inox::String` facade from `runtime/include/inox/string.h`.
Storage, allocation and UTF boundary helpers remain private implementation
details. The discoverable package descriptor in `compiler/index.ts` owns the
String operations; compiler core does not contain String method tables.
