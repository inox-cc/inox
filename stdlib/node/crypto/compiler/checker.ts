import {
  cryptoRuntimeMethodNameFromPath,
  isCryptoRuntimeMethod,
  isUnsupportedNodeCryptoMethod
} from './descriptor.ts'
import { isAssignableType } from '../../../../compiler/checker/assignability.ts'
import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode, SourceLocation, ValueType } from '../../../../compiler/types.ts'

export type CryptoCheckerDiagnostic = {
  code: string
  message: string
  loc: SourceLocation
}

export type CryptoCheckerContext = {
  argNullables: boolean[]
  argTypes: ValueType[]
  diagnostics: CryptoCheckerDiagnostic[]
  importedName: string | null
  moduleObjectMemberName: string | null
  supportsCryptoHash: boolean
}

export type CryptoHashMethodCheckerContext = {
  argNullables: boolean[]
  argTypes: ValueType[]
  diagnostics: CryptoCheckerDiagnostic[]
}

export type CryptoRuntimeCallInfo = {
  method: string
  label: string
  unsupported: boolean
}

export function cryptoRuntimeCallInfo(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): CryptoRuntimeCallInfo | null {
  const method = cryptoRuntimeMethodName(path, importedName, moduleObjectMemberName)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  let label = method

  if (path !== null && typeof path !== 'undefined') {
    label = joinStrings(path, '.')
  }

  return {
    method,
    label,
    unsupported: !isCryptoRuntimeMethod(method)
  }
}

export function checkCryptoCall(expression: AnyNode, context: CryptoCheckerContext): ValueType | null {
  const path = memberExpressionPath(expression.callee)
  const call = cryptoRuntimeCallInfo(path, context.importedName, context.moduleObjectMemberName)

  if (call === null || typeof call === 'undefined') {
    return null
  }

  if (call.unsupported) {
    pushCryptoCheckerDiagnostic(
      context.diagnostics,
      'INOX_NOT_IMPLEMENTED',
      `node:crypto ${call.method} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'
    return 'unknown'
  }

  const method = call.method
  const argTypes = context.argTypes

  if (method === 'getHashes') {
    expression.valueType = 'array'
    expression.arrayElementType = 'string'
    expression.cryptoRuntimeMethod = method

    if (expression.args.length !== 0) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 0 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (!context.supportsCryptoHash) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto getHashes requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
        expression.loc
      )
    }

    return 'array'
  }

  if (method === 'createHash') {
    expression.valueType = 'crypto-hash'
    expression.cryptoRuntimeMethod = method

    if (expression.args.length !== 1) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'crypto-hash'
    }

    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      cryptoArgNullable(context, 0)
    )

    if (!context.supportsCryptoHash) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto createHash requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
        expression.loc
      )
      return 'crypto-hash'
    }

    if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'sha256') {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto createHash only supports the 'sha256' algorithm in the current C backend",
        expression.args[0].loc
      )
    }

    return 'crypto-hash'
  }

  if (method === 'createHmac') {
    expression.valueType = 'crypto-hmac'
    expression.cryptoRuntimeMethod = method

    if (expression.args.length !== 2) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'crypto-hmac'
    }

    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[0],
      'string',
      expression.args[0].loc,
      false,
      cryptoArgNullable(context, 0)
    )

    if (!context.supportsCryptoHash) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto createHmac requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
        expression.loc
      )
      return 'crypto-hmac'
    }

    if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'sha256') {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto createHmac only supports the 'sha256' algorithm in the current C backend",
        expression.args[0].loc
      )
    }

    if (argTypes[1] !== 'string' && argTypes[1] !== 'bytes') {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_TYPE_MISMATCH',
        'node:crypto createHmac key must be a string or Buffer in the current C backend',
        expression.args[1].loc
      )
    }

    return 'crypto-hmac'
  }

  if (method === 'hash') {
    expression.cryptoRuntimeMethod = method

    if (expression.args.length < 2 || expression.args.length > 3) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 2 or 3 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      checkCryptoAssignableType(
        context.diagnostics,
        argTypes[0],
        'string',
        expression.args[0].loc,
        false,
        cryptoArgNullable(context, 0)
      )

      if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'sha256') {
        pushCryptoCheckerDiagnostic(
          context.diagnostics,
          'INOX_NOT_IMPLEMENTED',
          "node:crypto hash only supports the 'sha256' algorithm in the current C backend",
          expression.args[0].loc
        )
      }
    }

    if (
      expression.args[1] !== null &&
      typeof expression.args[1] !== 'undefined' &&
      argTypes[1] !== 'string' &&
      argTypes[1] !== 'bytes'
    ) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_TYPE_MISMATCH',
        'node:crypto hash data must be a string or Buffer in the current C backend',
        expression.args[1].loc
      )
    }

    if (!context.supportsCryptoHash) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto hash requires tlsBackend: 'boringssl' or 'openssl' in the current C backend",
        expression.loc
      )
    }

    if (expression.args[2] === null || typeof expression.args[2] === 'undefined') {
      expression.cryptoHashDigestEncoding = 'hex'
      expression.valueType = 'string'
      return 'string'
    }

    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[2],
      'string',
      expression.args[2].loc,
      false,
      cryptoArgNullable(context, 2)
    )

    if (expression.args[2].type === 'StringLiteral' && expression.args[2].value === 'buffer') {
      expression.cryptoHashDigestEncoding = 'bytes'
      expression.valueType = 'bytes'
      return 'bytes'
    }

    if (expression.args[2].type !== 'StringLiteral' || expression.args[2].value !== 'hex') {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_NOT_IMPLEMENTED',
        "node:crypto hash only supports the 'hex' and 'buffer' output encodings in the current C backend",
        expression.args[2].loc
      )
    }

    expression.cryptoHashDigestEncoding = 'hex'
    expression.valueType = 'string'

    return 'string'
  }

  if (method === 'timingSafeEqual') {
    expression.valueType = 'boolean'
    expression.cryptoRuntimeMethod = method

    if (expression.args.length !== 2) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'boolean'
    }

    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[0],
      'bytes',
      expression.args[0].loc,
      false,
      cryptoArgNullable(context, 0)
    )
    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[1],
      'bytes',
      expression.args[1].loc,
      false,
      cryptoArgNullable(context, 1)
    )

    return 'boolean'
  }

  expression.valueType = 'bytes'

  if (method === 'randomInt') {
    expression.valueType = 'number'
  } else if (method === 'randomUUID') {
    expression.valueType = 'string'
  }
  expression.cryptoRuntimeMethod = method

  if (method === 'getRandomValues') {
    if (expression.args.length !== 1) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'bytes'
    }

    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[0],
      'bytes',
      expression.args[0].loc,
      false,
      cryptoArgNullable(context, 0)
    )

    return 'bytes'
  }

  if (method === 'randomBytes') {
    if (expression.args.length !== 1) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'bytes'
    }

    checkCryptoAssignableType(context.diagnostics, argTypes[0], 'number', expression.args[0].loc, false, false)
    return 'bytes'
  }

  if (method === 'randomFillSync') {
    if (expression.args.length < 1 || expression.args.length > 3) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 to 3 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'bytes'
    }

    checkCryptoAssignableType(
      context.diagnostics,
      argTypes[0],
      'bytes',
      expression.args[0].loc,
      false,
      cryptoArgNullable(context, 0)
    )

    for (let index = 0; index < argTypes.length; index = index + 1) {
      const argType = argTypes[index]

      if (index > 0) {
        checkCryptoAssignableType(context.diagnostics, argType, 'number', expression.args[index].loc, false, false)
      }
    }

    return 'bytes'
  }

  if (method === 'randomInt') {
    if (expression.args.length < 1 || expression.args.length > 2) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
      return 'number'
    }

    for (let index = 0; index < argTypes.length; index = index + 1) {
      const argType = argTypes[index]

      checkCryptoAssignableType(context.diagnostics, argType, 'number', expression.args[index].loc, false, false)
    }

    return 'number'
  }

  if (expression.args.length !== 0) {
    pushCryptoCheckerDiagnostic(
      context.diagnostics,
      'INOX_NOT_IMPLEMENTED',
      'node:crypto randomUUID options are not implemented by the current C backend',
      expression.loc
    )
  }

  return 'string'
}

export function checkCryptoHashMethodCall(
  expression: AnyNode,
  objectType: ValueType,
  context: CryptoHashMethodCheckerContext
): ValueType | null {
  if (expression.callee.type !== 'MemberExpression') {
    return null
  }

  const method = expression.callee.property

  if (method !== 'update' && method !== 'digest') {
    return null
  }

  if (objectType !== 'crypto-hash' && objectType !== 'crypto-hmac') {
    return null
  }

  let label = 'Hash'

  if (objectType === 'crypto-hmac') {
    label = 'Hmac'
  }

  expression.cryptoRuntimeMethod = `${label}.${method}`

  if (method === 'update') {
    if (expression.args.length < 1 || expression.args.length > 2) {
      pushCryptoCheckerDiagnostic(
        context.diagnostics,
        'INOX_ARG_COUNT',
        `function ${label}.update expects 1 or 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (expression.args[0] !== null && typeof expression.args[0] !== 'undefined') {
      const dataType = context.argTypes[0]

      if (dataType !== 'string' && dataType !== 'bytes') {
        pushCryptoCheckerDiagnostic(
          context.diagnostics,
          'INOX_TYPE_MISMATCH',
          `${label}.update data must be a string or Buffer in the current C backend`,
          expression.args[0].loc
        )
      }
    }

    if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      const encodingType = context.argTypes[1]
      checkCryptoAssignableType(
        context.diagnostics,
        encodingType,
        'string',
        expression.args[1].loc,
        false,
        cryptoArgNullable(context, 1)
      )

      if (expression.args[1].type !== 'StringLiteral' || expression.args[1].value !== 'utf8') {
        pushCryptoCheckerDiagnostic(
          context.diagnostics,
          'INOX_NOT_IMPLEMENTED',
          `${label}.update only supports the 'utf8' input encoding in the current C backend`,
          expression.args[1].loc
        )
      }
    }

    expression.valueType = objectType
    return objectType
  }

  if (expression.args.length > 1) {
    pushCryptoCheckerDiagnostic(
      context.diagnostics,
      'INOX_ARG_COUNT',
      `function ${label}.digest expects 0 or 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (expression.args[0] === null || typeof expression.args[0] === 'undefined') {
    expression.cryptoHashDigestEncoding = 'bytes'
    expression.valueType = 'bytes'
    return 'bytes'
  }

  const encodingType = context.argTypes[0]
  checkCryptoAssignableType(
    context.diagnostics,
    encodingType,
    'string',
    expression.args[0].loc,
    false,
    cryptoArgNullable(context, 0)
  )

  if (expression.args[0].type !== 'StringLiteral' || expression.args[0].value !== 'hex') {
    pushCryptoCheckerDiagnostic(
      context.diagnostics,
      'INOX_NOT_IMPLEMENTED',
      `${label}.digest only supports the 'hex' encoding in the current C backend`,
      expression.args[0].loc
    )
  }

  expression.cryptoHashDigestEncoding = 'hex'
  expression.valueType = 'string'

  return 'string'
}

export function cryptoRuntimeMethodName(
  path: readonly string[] | null | undefined,
  importedName: string | null | undefined,
  moduleObjectMemberName: string | null | undefined
): string | null {
  const globalMethod = cryptoGlobalRuntimeMethodName(path)

  if (globalMethod !== null && typeof globalMethod !== 'undefined') {
    return globalMethod
  }

  if (moduleObjectMemberName !== null && typeof moduleObjectMemberName !== 'undefined') {
    return knownCryptoRuntimeMethodName(moduleObjectMemberName)
  }

  if (importedName !== null && typeof importedName !== 'undefined') {
    return knownCryptoRuntimeMethodName(importedName)
  }

  return null
}

function cryptoGlobalRuntimeMethodName(path: readonly string[] | null | undefined): string | null {
  if (path === null || typeof path === 'undefined') {
    return null
  }

  return cryptoRuntimeMethodNameFromPath(copyPath(path))
}

function knownCryptoRuntimeMethodName(name: string): string | null {
  if (isCryptoRuntimeMethod(name) || isUnsupportedNodeCryptoMethod(name)) {
    return name
  }

  return null
}

function joinStrings(values: readonly string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = `${result}${separator}`
    }

    result = `${result}${values[index]}`
  }

  return result
}

function checkCryptoAssignableType(
  diagnostics: CryptoCheckerDiagnostic[],
  actual: ValueType | null | undefined,
  expected: ValueType | null | undefined,
  loc: SourceLocation,
  expectedNullable?: boolean,
  actualNullable?: boolean
): void {
  const expectedAllowsNull = expectedNullable === true
  const actualCanBeNull = actualNullable === true

  if (isAssignableType(actual, expected, expectedAllowsNull, actualCanBeNull)) {
    return
  }

  let actualLabel = actual

  if (
    actualCanBeNull &&
    actual !== 'null' &&
    actual !== 'unknown' &&
    actual !== null &&
    typeof actual !== 'undefined'
  ) {
    actualLabel = `${actual} | null`
  }

  pushCryptoCheckerDiagnostic(diagnostics, 'INOX_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
}

function pushCryptoCheckerDiagnostic(
  diagnostics: CryptoCheckerDiagnostic[],
  code: string,
  message: string,
  loc: SourceLocation
): void {
  diagnostics.push({
    code,
    message,
    loc
  })
}

function cryptoArgNullable(
  context: CryptoCheckerContext | CryptoHashMethodCheckerContext,
  index: number
): boolean {
  return context.argNullables[index] === true
}

function copyPath(path: readonly string[]): string[] {
  const result: string[] = []

  for (const part of path) {
    result.push(part)
  }

  return result
}
