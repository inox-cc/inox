export {}

declare global {
  interface Math {
    abs(value: number): number;
    ceil(value: number): number;
    cos(value: number): number;
    floor(value: number): number;
    fround(value: number): number;
    max(left: number, right: number): number;
    min(left: number, right: number): number;
    random(): number;
    round(value: number): number;
    sin(value: number): number;
    sqrt(value: number): number;
    trunc(value: number): number;
  }

  const Math: Math;
}
