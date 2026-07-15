export {}

declare global {
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
