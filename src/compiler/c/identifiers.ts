export function cStringLiteral(value: string): string {
  return JSON.stringify(value)
}

export function emitCIdentifier(value: string): string {
  let result = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (isCIdentifierCode(code)) {
      result = result + value[index]
    } else {
      result = result + '_'
    }
  }

  return result
}

function isCIdentifierCode(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 95
  )
}

export function emitCFunctionName(name: string): string {
  if (name === 'main') {
    return 'ccjs_main'
  }

  return name
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
