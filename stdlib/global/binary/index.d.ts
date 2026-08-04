export {};

declare global {
  class Uint8Array {
    readonly length: number;
    [index: number]: number | undefined;

    constructor(length: number);
    constructor(values: number[]);
    constructor(values: Uint8Array);

    at(index: number): number | undefined;
    fill(value: number, start?: number, end?: number): Uint8Array;
    set(values: number[] | Uint8Array, offset?: number): void;
    slice(start: number, end?: number): Uint8Array;
    subarray(start?: number, end?: number): Uint8Array;
    toString(): string;
  }
}
