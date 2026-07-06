import { diagnostic } from '../../../../compiler/diagnostics.ts'
import type { AnyNode, IrProgram, SourceLocation } from '../../../../compiler/types.ts'
import type { CEmitContext, CFunctionContext } from '../../../../compiler/c/context.ts'
import {
  emitRuntimeTypeCheck,
  nextCName
} from '../../../../compiler/c/context.ts'
import { collectStdlibRuntimeImportNames } from '../../../../compiler/c/runtime-imports.ts'
import { isCryptoRuntimeMethod } from './descriptor.ts'
import type {
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from '../../../../compiler/c/types.ts'

export type CryptoLoweringDependencies = {
  cStringLiteralNode: (value: string, loc: SourceLocation | undefined) => AnyNode
  emitCValueExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedNumberExpression: (expression: AnyNode, context: CFunctionContext) => PreparedExpression
  emitPreparedStringBytesOperand: (
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix: string
  ) => PreparedStringBytesOperand
  inferExpressionType: (expression: AnyNode, context: CFunctionContext) => string
}

type CryptoRandomFillCall = {
  lines: string[]
  call: string
}

type CryptoDataArgument = {
  lines: string[]
  expression: string
}

export function registerCryptoRuntimeImportNames(context: CEmitContext, irPrograms: IrProgram[]): void {
  context.cryptoImportNames = collectStdlibRuntimeImportNames(irPrograms, 'crypto', 'module-object')
}

function pushCryptoLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(line)
  }
}

function emptyPreparedCryptoExpression(expression: string): PreparedExpression {
  return {
    lines: [],
    expression
  }
}

function cryptoArgOrEmptyString(expression: AnyNode, index: number, deps: CryptoLoweringDependencies): AnyNode {
  if (expression.args.length > index) {
    return expression.args[index]
  }

  return deps.cStringLiteralNode('', expression.loc)
}

function cryptoOutName(options: PreparedCallOptions, context: CFunctionContext, prefix: string): string {
  let out = nextCName(context, prefix)

  if (options.out !== null && typeof options.out !== 'undefined') {
    out = options.out
  }

  return out
}

function cryptoResultExpression(options: PreparedCallOptions, value: string): string {
  if (options.discard === true) {
    return ''
  }

  return value
}

function cryptoResultWrite(out: string, expression: string, options: PreparedCallOptions): string {
  if (options.prepareOut === false) {
    return `${out} = ${expression};`
  }

  return `auto ${out} = ${expression};`
}

function cryptoStringViewExpression(operand: PreparedStringBytesOperand): string {
  return operand.cppExpression ?? `inox::StringView(${operand.bytes}, ${operand.length})`
}

function cryptoValueExpression(value: PreparedExpression): string {
  const cppType = value.cppType

  if (typeof cppType === 'string' && cppType !== '') {
    return value.expression
  }

  return `inox::Value(${value.expression})`
}

function cryptoBytesExpression(value: PreparedExpression): string {
  if (value.cppType === 'Uint8Array' || value.cppType === 'Buffer') {
    return value.expression
  }

  return `Uint8Array(${value.expression})`
}

function cryptoDataArgument(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies,
  tempPrefix: string
): CryptoDataArgument {
  if (deps.inferExpressionType(expression, context) === 'string') {
    const data = deps.emitPreparedStringBytesOperand(expression, context, tempPrefix)

    return {
      lines: data.lines,
      expression: cryptoStringViewExpression(data)
    }
  }

  const data = deps.emitCValueExpression(expression, context)

  return {
    lines: data.lines,
    expression: cryptoValueExpression(data)
  }
}

export function cryptoRuntimeMethodName(
  expression: AnyNode | null | undefined,
  context?: CFunctionContext | null
): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression'
  ) {
    return null
  }

  if (expression.cryptoRuntimeMethod !== null && typeof expression.cryptoRuntimeMethod !== 'undefined') {
    return expression.cryptoRuntimeMethod
  }

  if (context !== null && typeof context !== 'undefined') {
    return cryptoRuntimeMethodNameFromCallee(expression.callee, context)
  }

  return null
}

function cryptoRuntimeMethodNameFromCallee(callee: AnyNode, context: CFunctionContext): string | null {
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'Reference' || callee.object.path.length !== 1) {
    return null
  }

  const root = callee.object.path[0]

  if (root !== 'crypto' && !context.cryptoImportNames.has(root)) {
    return null
  }

  if (!isCryptoRuntimeMethod(callee.property)) {
    return null
  }

  return callee.property
}

export function emitCryptoHashVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies
): string[] | null {
  if (statement.init === null || typeof statement.init === 'undefined' || statement.init.type !== 'CallExpression') {
    return null
  }

  if (cryptoRuntimeMethodName(statement.init, context) === 'createHash') {
    const prepared = emitPreparedCryptoHashCallExpression(statement.init, context, deps, {
      out: statement.name
    })

    if (prepared !== null && typeof prepared !== 'undefined') {
      return prepared.lines
    }

    return null
  }

  if (cryptoRuntimeMethodName(statement.init, context) === 'createHmac') {
    const prepared = emitPreparedCryptoHmacCallExpression(statement.init, context, deps, {
      out: statement.name
    })

    if (prepared !== null && typeof prepared !== 'undefined') {
      return prepared.lines
    }

    return null
  }

  if (deps.inferExpressionType(statement.init, context) !== 'crypto-hash') {
    if (deps.inferExpressionType(statement.init, context) !== 'crypto-hmac') {
      return null
    }

    const handle = emitPreparedCryptoHmacHandleExpression(statement.init, context, deps)

    context.variables.set(statement.name, 'crypto-hmac')

    const lines: string[] = []
    pushCryptoLines(lines, handle.lines)
    lines.push(`Hmac& ${statement.name} = ${handle.expression};`)
    return lines
  }

  const handle = emitPreparedCryptoHashHandleExpression(statement.init, context, deps)

  context.variables.set(statement.name, 'crypto-hash')

  const lines: string[] = []
  pushCryptoLines(lines, handle.lines)
  lines.push(`Hash& ${statement.name} = ${handle.expression};`)
  return lines
}

export function emitCryptoHandleVariableDeclaration(
  statement: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies,
  inferred: string
): string[] | null {
  if (inferred === 'crypto-hash') {
    const handle = emitPreparedCryptoHashHandleExpression(statement.init, context, deps)

    context.variables.set(statement.name, 'crypto-hash')

    const lines: string[] = []
    pushCryptoLines(lines, handle.lines)
    lines.push(`Hash& ${statement.name} = ${handle.expression};`)
    return lines
  }

  if (inferred === 'crypto-hmac') {
    const handle = emitPreparedCryptoHmacHandleExpression(statement.init, context, deps)

    context.variables.set(statement.name, 'crypto-hmac')

    const lines: string[] = []
    pushCryptoLines(lines, handle.lines)
    lines.push(`Hmac& ${statement.name} = ${handle.expression};`)
    return lines
  }

  return null
}

export function emitPreparedCryptoHashCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression, context)

  if (method === 'createHash') {
    const algorithmArg = cryptoArgOrEmptyString(expression, 0, deps)
    const algorithm = deps.emitPreparedStringBytesOperand(algorithmArg, context, 'inox_crypto_algorithm')
    const out = cryptoOutName(options, context, 'inox_crypto_hash')

    context.variables.set(out, 'crypto-hash')

    const lines: string[] = []
    pushCryptoLines(lines, algorithm.lines)
    lines.push(cryptoResultWrite(out, `crypto.createHash(${cryptoStringViewExpression(algorithm)})`, options))
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out
    }
  }

  if (method !== 'Hash.update') {
    return null
  }

  const handle = emitPreparedCryptoHashHandleExpression(expression.callee.object, context, deps)
  const dataArg = cryptoArgOrEmptyString(expression, 0, deps)
  const data = cryptoDataArgument(dataArg, context, deps, 'inox_crypto_data')
  const lines: string[] = []

  pushCryptoLines(lines, handle.lines)
  pushCryptoLines(lines, data.lines)
  lines.push(`${handle.expression}.update(${data.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: handle.expression
  }
}

export function emitPreparedCryptoHmacCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression, context)

  if (method === 'createHmac') {
    const algorithmArg = cryptoArgOrEmptyString(expression, 0, deps)
    const algorithm = deps.emitPreparedStringBytesOperand(algorithmArg, context, 'inox_crypto_algorithm')
    const keyArg = cryptoArgOrEmptyString(expression, 1, deps)
    const key = cryptoDataArgument(keyArg, context, deps, 'inox_crypto_key')
    const out = cryptoOutName(options, context, 'inox_crypto_hmac')

    context.variables.set(out, 'crypto-hmac')

    const lines: string[] = []
    pushCryptoLines(lines, algorithm.lines)
    pushCryptoLines(lines, key.lines)
    lines.push(cryptoResultWrite(out, `crypto.createHmac(${cryptoStringViewExpression(algorithm)}, ${key.expression})`, options))
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out
    }
  }

  if (method !== 'Hmac.update') {
    return null
  }

  const handle = emitPreparedCryptoHmacHandleExpression(expression.callee.object, context, deps)
  const dataArg = cryptoArgOrEmptyString(expression, 0, deps)
  const data = cryptoDataArgument(dataArg, context, deps, 'inox_crypto_data')
  const lines: string[] = []

  pushCryptoLines(lines, handle.lines)
  pushCryptoLines(lines, data.lines)
  lines.push(`${handle.expression}.update(${data.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: handle.expression
  }
}

export function emitPreparedCryptoCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression, context)

  if (method === null || typeof method === 'undefined' || method === 'randomInt' || method === 'timingSafeEqual') {
    return null
  }

  if (method === 'createHash' || method === 'Hash.update' || method === 'createHmac' || method === 'Hmac.update') {
    return null
  }

  if (method === 'getHashes') {
    const out = cryptoOutName(options, context, 'inox_crypto_hashes')
    const lines: string[] = []

    lines.push(`auto ${out} = crypto.getHashes();`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: cryptoResultExpression(options, out),
      cppType: 'Array',
      valueType: 'array'
    }
  }

  if (method === 'hash') {
    const algorithmArg = cryptoArgOrEmptyString(expression, 0, deps)
    const algorithm = deps.emitPreparedStringBytesOperand(algorithmArg, context, 'inox_crypto_algorithm')
    const dataArg = cryptoArgOrEmptyString(expression, 1, deps)
    const data = cryptoDataArgument(dataArg, context, deps, 'inox_crypto_data')
    const out = cryptoOutName(options, context, 'inox_crypto_digest')
    let encoding = 'hex'
    let digestCall = `crypto.hash(${cryptoStringViewExpression(algorithm)}, ${data.expression})`
    let cppType = 'Buffer'
    let valueType = 'bytes'
    const lines: string[] = []

    if (expression.cryptoHashDigestEncoding === 'bytes') {
      encoding = 'bytes'
    }

    if (encoding === 'hex') {
      digestCall = `crypto.hashHex(${cryptoStringViewExpression(algorithm)}, ${data.expression})`
      cppType = 'inox::String'
      valueType = 'string'
    }

    pushCryptoLines(lines, algorithm.lines)
    pushCryptoLines(lines, data.lines)
    lines.push(`auto ${out} = ${digestCall};`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: cryptoResultExpression(options, out),
      cppType,
      valueType
    }
  }

  if (method === 'Hash.digest' || method === 'Hmac.digest') {
    const isHmac = method === 'Hmac.digest'
    let handle = emptyPreparedCryptoExpression('0')
    const out = cryptoOutName(options, context, 'inox_crypto_digest')
    let encoding = 'bytes'
    let digestCall = ''
    let cppType = 'Buffer'
    let valueType = 'bytes'
    const lines: string[] = []

    if (isHmac) {
      handle = emitPreparedCryptoHmacHandleExpression(expression.callee.object, context, deps)
    } else {
      handle = emitPreparedCryptoHashHandleExpression(expression.callee.object, context, deps)
    }

    if (expression.cryptoHashDigestEncoding === 'hex') {
      encoding = 'hex'
    }

    if (encoding === 'hex') {
      digestCall = `${handle.expression}.digestHex()`
      cppType = 'inox::String'
      valueType = 'string'
    } else {
      digestCall = `${handle.expression}.digest()`
    }

    pushCryptoLines(lines, handle.lines)
    lines.push(`auto ${out} = ${digestCall};`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: cryptoResultExpression(options, out),
      cppType,
      valueType
    }
  }

  if (method === 'getRandomValues' || method === 'randomFillSync') {
    const value = deps.emitCValueExpression(expression.args[0], context)
    let preparedCall: CryptoRandomFillCall = {
      lines: [],
      call: `crypto.getRandomValues(${cryptoBytesExpression(value)})`
    }
    const lines: string[] = []

    if (method === 'randomFillSync') {
      preparedCall = emitCryptoRandomFillCall(cryptoBytesExpression(value), expression, context, deps)
    }

    pushCryptoLines(lines, value.lines)
    pushCryptoLines(lines, preparedCall.lines)

    if (options.discard === true) {
      lines.push(`${preparedCall.call};`)
      lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

      return {
        lines,
        expression: ''
      }
    }

    const out = cryptoOutName(options, context, 'inox_crypto_bytes')

    lines.push(`auto ${out} = ${preparedCall.call};`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out,
      cppType: 'Uint8Array',
      valueType: 'bytes'
    }
  }

  if (method === 'randomBytes') {
    const size = deps.emitPreparedNumberExpression(expression.args[0], context)
    const out = cryptoOutName(options, context, 'inox_crypto_bytes')
    const lines: string[] = []

    pushCryptoLines(lines, size.lines)
    lines.push(`auto ${out} = crypto.randomBytes(${size.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: cryptoResultExpression(options, out),
      cppType: 'Buffer',
      valueType: 'bytes'
    }
  }

  const out = cryptoOutName(options, context, 'inox_crypto_uuid')
  const lines: string[] = []

  lines.push(`auto ${out} = crypto.randomUUID();`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: cryptoResultExpression(options, out),
    cppType: 'inox::String',
    valueType: 'string'
  }
}

export function emitPreparedCryptoNumberCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression, context)

  if (method === 'timingSafeEqual') {
    const left = deps.emitCValueExpression(expression.args[0], context)
    const right = deps.emitCValueExpression(expression.args[1], context)
    const out = nextCName(context, 'inox_crypto_equal')
    const lines: string[] = []

    pushCryptoLines(lines, left.lines)
    pushCryptoLines(lines, right.lines)
    lines.push(`auto ${out} = crypto.timingSafeEqual(${cryptoBytesExpression(left)}, ${cryptoBytesExpression(right)});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out
    }
  }

  if (method !== 'randomInt') {
    return null
  }

  const max = deps.emitPreparedNumberExpression(expression.args[expression.args.length === 1 ? 0 : 1], context)
  const out = nextCName(context, 'inox_crypto_int')
  const lines: string[] = []

  if (expression.args.length === 1) {
    pushCryptoLines(lines, max.lines)
    lines.push(`auto ${out} = crypto.randomInt(${max.expression});`)
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

    return {
      lines,
      expression: out
    }
  }

  const min = deps.emitPreparedNumberExpression(expression.args[0], context)

  pushCryptoLines(lines, min.lines)
  pushCryptoLines(lines, max.lines)
  lines.push(`auto ${out} = crypto.randomInt(${min.expression}, ${max.expression});`)
  lines.push(emitRuntimeTypeCheck('inox::thrown()', context))

  return {
    lines,
    expression: out
  }
}

export function emitPreparedCryptoHashHandleExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies
): PreparedExpression {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'crypto-hash') {
      return {
        lines: [],
        expression: name
      }
    }
  }

  if (expression.type === 'CallExpression') {
    const call = emitPreparedCryptoHashCallExpression(expression, context, deps, {})

    if (call !== null && typeof call !== 'undefined') {
      return call
    }
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_CRYPTO_HASH',
      'this crypto hash expression is not supported by the current C++ backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

export function emitPreparedCryptoHmacHandleExpression(
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies
): PreparedExpression {
  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'crypto-hmac') {
      return {
        lines: [],
        expression: name
      }
    }
  }

  if (expression.type === 'CallExpression') {
    const call = emitPreparedCryptoHmacCallExpression(expression, context, deps, {})

    if (call !== null && typeof call !== 'undefined') {
      return call
    }
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_CRYPTO_HMAC',
      'this crypto hmac expression is not supported by the current C++ backend slice',
      expression.loc
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitCryptoRandomFillCall(
  value: string,
  expression: AnyNode,
  context: CFunctionContext,
  deps: CryptoLoweringDependencies
): CryptoRandomFillCall {
  let offset = emptyPreparedCryptoExpression('0')
  let size = emptyPreparedCryptoExpression('0')
  let hasSize = 'false'
  const lines: string[] = []

  if (expression.args.length > 1) {
    offset = deps.emitPreparedNumberExpression(expression.args[1], context)
  }

  if (expression.args.length > 2) {
    size = deps.emitPreparedNumberExpression(expression.args[2], context)
    hasSize = 'true'
  }

  pushCryptoLines(lines, offset.lines)
  pushCryptoLines(lines, size.lines)

  return {
    lines,
    call: `crypto.randomFillSync(${value}, ${offset.expression}, ${size.expression}, ${hasSize})`
  }
}
