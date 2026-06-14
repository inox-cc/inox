export function cStringLiteral(value: string): string {
  return JSON.stringify(value)
}

export function emitCIdentifier(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_')
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export function escapeCString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}
