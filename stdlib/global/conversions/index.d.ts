export {}

declare global {
  function String(value: unknown): string
  function Number(value: string): number | null
}
