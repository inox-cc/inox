export {}

declare global {
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
