export {}

declare global {
  function Boolean(value: unknown): boolean
  function String(value: unknown): string
  function Number(value: string): number | null
  function i32(value: number): number
  function u32(value: number): number
  function u64(value: number): number
  function f32(value: number): number
  function f64(value: number): number
}
