export function cStringLiteral(value: string): string {
  return `"${escapeCString(value)}"`
}

export function escapeCPrintfFormatText(value: string): string {
  let result = ''

  for (let index = 0; index < value.length; index = index + 1) {
    const unit = value.slice(index, index + 1)

    if (unit === '%') {
      result = result + '%%'
    } else {
      result = result + unit
    }
  }

  return result
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

  if (result === '' || isDigitCode(result.charCodeAt(0)) || isReservedCIdentifier(result)) {
    return `inox_${result}`
  }

  return result
}

function isCIdentifierCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95
}

function isDigitCode(code: number): boolean {
  return code >= 48 && code <= 57
}

function isReservedCIdentifier(value: string): boolean {
  return (
    value === 'auto' ||
    value === 'alignas' ||
    value === 'alignof' ||
    value === 'and' ||
    value === 'and_eq' ||
    value === 'asm' ||
    value === 'bitand' ||
    value === 'bitor' ||
    value === 'bool' ||
    value === 'break' ||
    value === 'case' ||
    value === 'catch' ||
    value === 'char' ||
    value === 'char8_t' ||
    value === 'char16_t' ||
    value === 'char32_t' ||
    value === 'class' ||
    value === 'compl' ||
    value === 'concept' ||
    value === 'const' ||
    value === 'consteval' ||
    value === 'constexpr' ||
    value === 'constinit' ||
    value === 'const_cast' ||
    value === 'continue' ||
    value === 'co_await' ||
    value === 'co_return' ||
    value === 'co_yield' ||
    value === 'decltype' ||
    value === 'default' ||
    value === 'delete' ||
    value === 'do' ||
    value === 'double' ||
    value === 'dynamic_cast' ||
    value === 'else' ||
    value === 'enum' ||
    value === 'explicit' ||
    value === 'extern' ||
    value === 'false' ||
    value === 'float' ||
    value === 'friend' ||
    value === 'for' ||
    value === 'goto' ||
    value === 'if' ||
    value === 'index' ||
    value === 'inline' ||
    value === 'inox_main' ||
    value === 'inox_user_main' ||
    value === 'int' ||
    value === 'long' ||
    value === 'mutable' ||
    value === 'namespace' ||
    value === 'new' ||
    value === 'noexcept' ||
    value === 'not' ||
    value === 'not_eq' ||
    value === 'nullptr' ||
    value === 'or' ||
    value === 'or_eq' ||
    value === 'operator' ||
    value === 'private' ||
    value === 'protected' ||
    value === 'public' ||
    value === 'random' ||
    value === 'register' ||
    value === 'reinterpret_cast' ||
    value === 'requires' ||
    value === 'restrict' ||
    value === 'return' ||
    value === 'short' ||
    value === 'signed' ||
    value === 'sizeof' ||
    value === 'static' ||
    value === 'static_assert' ||
    value === 'static_cast' ||
    value === 'struct' ||
    value === 'switch' ||
    value === 'template' ||
    value === 'this' ||
    value === 'thread_local' ||
    value === 'throw' ||
    value === 'true' ||
    value === 'typedef' ||
    value === 'typeid' ||
    value === 'typename' ||
    value === 'try' ||
    value === 'union' ||
    value === 'unsigned' ||
    value === 'using' ||
    value === 'virtual' ||
    value === 'void' ||
    value === 'volatile' ||
    value === 'wchar_t' ||
    value === 'while' ||
    value === 'xor' ||
    value === 'xor_eq'
  )
}

export function emitCFunctionName(name: string): string {
  if (name === 'main') {
    return 'inox_user_main'
  }

  return emitCIdentifier(name)
}

export function emitCObjectFunctionFieldName(objectName: string, fieldName: string): string {
  return `inox_objfn_${emitCIdentifier(objectName)}_${emitCIdentifier(fieldName)}`
}

export function emitCRuntimeCallbackFieldName(objectName: string, fieldName: string): string {
  return `inox_callback_field_${emitCIdentifier(objectName)}_${emitCIdentifier(fieldName)}`
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

    if (code === 34) {
      result = result + '\\"'
    } else if (code === 92) {
      result = result + '\\\\'
    } else if (code === 9) {
      result = result + '\\t'
    } else if (code === 10) {
      result = result + '\\n'
    } else if (code === 13) {
      result = result + '\\r'
    } else if (isPrintableAsciiCode(code)) {
      result = result + value.slice(index, index + 1)
    } else if (code <= 127) {
      result = result + cHexByteEscape(code)

      if (index + 1 < value.length && isHexDigitCode(value.charCodeAt(index + 1))) {
        result = result + '" "'
      }
    } else {
      result = result + value.slice(index, index + 1)
    }
  }

  return result
}

function isPrintableAsciiCode(code: number): boolean {
  return code >= 32 && code <= 126
}

function isHexDigitCode(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102)
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
