export {}

declare global {
  class Array<T> {
    readonly length: number;

    static from(value: string): Array<string>;
    static isArray(value: unknown): boolean;

    filter(predicate: (value: T, index: number) => boolean): Array<T>;
    find(predicate: (value: T, index: number) => boolean): T | undefined;
    includes(value: T): boolean;
    join(separator?: string): string;
    map<U>(callback: (value: T, index: number) => U): Array<U>;
    pop(): T | undefined;
    push(value: T): number;
    reduce<U>(callback: (accumulator: U, value: T, index: number) => U, initialValue: U): U;
    slice(start?: number, end?: number): Array<T>;
    some(predicate: (value: T, index: number) => boolean): boolean;
    sort(compare?: (left: T, right: T) => number): Array<T>;
    unshift(value: T): number;
  }

  class Map<K, V> {
    readonly size: number;

    constructor();
    constructor(entries: Array<Array<K | V>> | Map<K, V>);

    clear(): void;
    delete(key: K): boolean;
    entries(): Array<Array<K | V>>;
    get(key: K): V | undefined;
    has(key: K): boolean;
    keys(): Array<K>;
    set(key: K, value: V): Map<K, V>;
    values(): Array<V>;
  }

  class Set<T> {
    readonly size: number;

    constructor();
    constructor(values: Array<T> | Set<T>);

    add(value: T): Set<T>;
    clear(): void;
    delete(value: T): boolean;
    has(value: T): boolean;
  }
}
