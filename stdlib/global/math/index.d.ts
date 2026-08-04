export {}

declare global {
  interface Math {
    readonly E: number;
    readonly PI: number;
    abs(value: number): number;
    acos(value: number): number;
    asin(value: number): number;
    atan(value: number): number;
    atan2(y: number, x: number): number;
    cbrt(value: number): number;
    ceil(value: number): number;
    cos(value: number): number;
    exp(value: number): number;
    floor(value: number): number;
    fround(value: number): number;
    hypot(...values: number[]): number;
    log(value: number): number;
    log10(value: number): number;
    log2(value: number): number;
    max(...values: number[]): number;
    min(...values: number[]): number;
    pow(base: number, exponent: number): number;
    random(): number;
    round(value: number): number;
    sign(value: number): number;
    sin(value: number): number;
    sqrt(value: number): number;
    tan(value: number): number;
    trunc(value: number): number;
  }

  const Math: Math;
}
