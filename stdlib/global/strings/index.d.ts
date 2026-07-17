export {}

declare global {
  interface Number {
    toString(radix?: number): string;
  }

  interface String {
    readonly length: number;
    readonly [index: number]: string;

    charCodeAt(index: number): number;
    concat(value: string): string;
    endsWith(value: string): boolean;
    includes(value: string, position?: number): boolean;
    indexOf(value: string, position?: number): number;
    lastIndexOf(value: string, position?: number): number;
    padStart(targetLength: number, pad?: string): string;
    slice(start: number, end?: number): string;
    split(separator: string): Array<string>;
    startsWith(value: string): boolean;
    toUpperCase(): string;
    trim(): string;
    trimEnd(): string;
    trimLeft(): string;
    trimRight(): string;
    trimStart(): string;
  }
}
