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
  let length = 0

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (code <= 127) {
      length = length + 1
    } else if (code <= 2047) {
      length = length + 2
    } else if (isHighSurrogate(code) && index + 1 < value.length && isLowSurrogate(value.charCodeAt(index + 1))) {
      length = length + 4
      index = index + 1
    } else {
      length = length + 3
    }
  }

  return length
}

export function escapeCString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
}

function isHighSurrogate(code: number): boolean {
  return code >= 55296 && code <= 56319
}

function isLowSurrogate(code: number): boolean {
  return code >= 56320 && code <= 57343
}
