export function cStringLiteral(value: string): string {
  return JSON.stringify(value)
}

export function emitCIdentifier(value: string): string {
  let result = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (isCIdentifierCode(code)) {
      result = result + value.slice(index, index + 1)
    } else {
      result = result + '_'
    }
  }

  return result
}

function isCIdentifierCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95
}

export function emitCFunctionName(name: string): string {
  if (name === 'main') {
    return 'inox_main'
  }

  return name
}

export function emitCObjectFunctionFieldName(objectName: string, fieldName: string): string {
  return `inox_objfn_${emitCIdentifier(objectName)}_${emitCIdentifier(fieldName)}`
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
  let result = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const code = value.charCodeAt(index)

    if (code <= 127) {
      result = result + cHexByteEscape(code)
    } else {
      result = result + value.slice(index, index + 1)
    }
  }

  return result
}

function cHexByteEscape(code: number): string {
  const high = Math.floor(code / 16)
  const low = code - high * 16

  return `\\x${hexDigit(high)}${hexDigit(low)}`
}

function hexDigit(value: number): string {
  if (value === 0) {
    return '0'
  }

  if (value === 1) {
    return '1'
  }

  if (value === 2) {
    return '2'
  }

  if (value === 3) {
    return '3'
  }

  if (value === 4) {
    return '4'
  }

  if (value === 5) {
    return '5'
  }

  if (value === 6) {
    return '6'
  }

  if (value === 7) {
    return '7'
  }

  if (value === 8) {
    return '8'
  }

  if (value === 9) {
    return '9'
  }

  if (value === 10) {
    return 'a'
  }

  if (value === 11) {
    return 'b'
  }

  if (value === 12) {
    return 'c'
  }

  if (value === 13) {
    return 'd'
  }

  if (value === 14) {
    return 'e'
  }

  return 'f'
}

function isHighSurrogate(code: number): boolean {
  return code >= 55296 && code <= 56319
}

function isLowSurrogate(code: number): boolean {
  return code >= 56320 && code <= 57343
}
