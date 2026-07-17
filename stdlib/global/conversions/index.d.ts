export {}

declare global {
  function Boolean(value: unknown): boolean
  function String(value: unknown): string
  function Number(value: string): number | null
}
