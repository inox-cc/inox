# Collections

This package provides the global `Array`, `Map` and `Set` types. Removing the
package removes their declarations, compiler operations and C++ implementation;
compiler core does not recognize these type names.

## Array

Supported API:

```ts
class Array<T> {
  readonly length: number

  static from(value: string): Array<string>
  static isArray(value: unknown): boolean

  at(index: number): T | undefined
  concat(...items: Array<T | Array<T>>): Array<T>
  every(predicate: (value: T, index: number, array: Array<T>) => boolean): boolean
  fill(value: T, start?: number, end?: number): Array<T>
  filter(predicate: (value: T, index: number, array: Array<T>) => boolean): Array<T>
  find(predicate: (value: T, index: number, array: Array<T>) => boolean): T | undefined
  findIndex(predicate: (value: T, index: number, array: Array<T>) => boolean): number
  findLast(predicate: (value: T, index: number, array: Array<T>) => boolean): T | undefined
  findLastIndex(predicate: (value: T, index: number, array: Array<T>) => boolean): number
  forEach(callback: (value: T, index: number, array: Array<T>) => void): void
  includes(value: T): boolean
  indexOf(value: T, fromIndex?: number): number
  join(separator?: string): string
  lastIndexOf(value: T, fromIndex?: number): number
  map<U>(callback: (value: T, index: number, array: Array<T>) => U): Array<U>
  pop(): T | undefined
  push(...values: T[]): number
  reduce<U>(callback: (result: U, value: T, index: number, array: Array<T>) => U, initial: U): U
  reverse(): Array<T>
  shift(): T | undefined
  slice(start?: number, end?: number): Array<T>
  some(predicate: (value: T, index: number, array: Array<T>) => boolean): boolean
  sort(compare?: (left: T, right: T) => number): Array<T>
  unshift(...values: T[]): number
}
```

Indexed writes grow the array and fill skipped positions with `undefined`.
`slice()` supports negative and clamped indexes. Default `sort()` compares the
string representation of values lexicographically and is stable. `Array.from()`
splits strings on valid UTF-8 code-point boundaries, so it never creates an
invalid surrogate-half string.

## Map

Supported API:

```ts
class Map<K, V> {
  readonly size: number

  constructor()
  constructor(entries: Array<Array<K | V>> | Map<K, V>)

  clear(): void
  delete(key: K): boolean
  entries(): MapIterator<Array<K | V>>
  forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void
  get(key: K): V | undefined
  has(key: K): boolean
  keys(): MapIterator<K>
  set(key: K, value: V): Map<K, V>
  values(): MapIterator<V>
}
```

Map iteration follows insertion order. Updating an existing key preserves its
position; deleting and adding it again moves it to the end. Bracket access is
not Map syntax: use `get()` and `set()`.

Keys use SameValueZero-inspired equality: `NaN` equals `NaN`, `-0` equals `0`,
strings compare by content, and managed objects and collections compare by
identity.

## Set

Supported API:

```ts
class Set<T> {
  readonly size: number

  constructor()
  constructor(values: Array<T> | Set<T>)

  add(value: T): Set<T>
  clear(): void
  delete(value: T): boolean
  entries(): SetIterator<Array<T>>
  forEach(callback: (value: T, key: T, set: Set<T>) => void): void
  has(value: T): boolean
  keys(): SetIterator<T>
  values(): SetIterator<T>
}
```

`for...of` follows insertion order with the same update and reinsertion rules
as `Map`.

## C++ facade

Generated code uses the public `Array`, `Map`, `MapIterator`, `Set` and
`SetIterator` facades. Storage layouts, hashing, tombstones and insertion-order
indexes are private to `src/collections.cc`.

The package descriptor in `compiler/index.ts` owns all native identities,
operations, iteration contracts and runtime requirements. Portable compiler
code consumes only those generic descriptors.
