export {}

declare global {
  interface MapIterator<T> {}

  class Array<T> {
    readonly length: number

    static from(value: string): Array<string>
    static isArray(value: unknown): boolean

    every(predicate: (value: T, index: number, array: Array<T>) => boolean): boolean
    filter(predicate: (value: T, index: number, array: Array<T>) => boolean): Array<T>
    find(predicate: (value: T, index: number, array: Array<T>) => boolean): T | undefined
    includes(value: T): boolean
    join(separator?: string): string
    map<U>(callback: (value: T, index: number, array: Array<T>) => U): Array<U>
    pop(): T | undefined
    push(...values: T[]): number
    reduce<U>(callback: (accumulator: U, value: T, index: number, array: Array<T>) => U, initialValue: U): U
    slice(start?: number, end?: number): Array<T>
    some(predicate: (value: T, index: number, array: Array<T>) => boolean): boolean
    sort(compare?: (left: T, right: T) => number): Array<T>
    unshift(...values: T[]): number
  }

  class Map<K, V> {
    readonly size: number

    constructor()
    constructor(entries: Array<Array<K | V>> | Map<K, V>)

    clear(): void
    delete(key: K): boolean
    entries(): MapIterator<Array<K | V>>
    get(key: K): V | undefined
    has(key: K): boolean
    keys(): MapIterator<K>
    set(key: K, value: V): Map<K, V>
    values(): MapIterator<V>
  }

  class Set<T> {
    readonly size: number

    constructor()
    constructor(values: Array<T> | Set<T>)

    add(value: T): Set<T>
    clear(): void
    delete(value: T): boolean
    has(value: T): boolean
  }
}
