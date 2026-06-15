import { diagnostic } from '../../diagnostics.ts'
import {
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerOwnedCryptoHash,
  registerOwnedCryptoHmac,
  registerOwnedValue
} from '../context.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'

type PreparedExpression = {
  lines: string[]
  expression: string
}

type PreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
}

export type CryptoLoweringDependencies = {
  cStringLiteralNode: (value: string, loc?: any) => any
  emitCValueExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedNumberExpression: (expression: any, context: any) => PreparedExpression
  emitPreparedStringBytesOperand: (expression: any, context: any, tempPrefix?: string) => PreparedStringBytesOperand
  inferExpressionType: (expression: any, context: any) => string
}

type CryptoHandleOptions = {
  out?: string
  owned?: boolean
}

type CryptoValueOptions = {
  discard?: boolean
}

export function cryptoRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.cryptoRuntimeMethod !== 'string') {
    return null
  }

  return expression.cryptoRuntimeMethod
}

export function emitCryptoHashVariableDeclaration(
  statement: any,
  context: any,
  deps: CryptoLoweringDependencies
): string[] | null {
  if (statement.init?.type !== 'CallExpression') {
    return null
  }

  if (cryptoRuntimeMethodName(statement.init) === 'createHash') {
    return (
      emitPreparedCryptoHashCallExpression(statement.init, context, deps, {
        out: statement.name
      })?.lines ?? null
    )
  }

  if (cryptoRuntimeMethodName(statement.init) === 'createHmac') {
    return (
      emitPreparedCryptoHmacCallExpression(statement.init, context, deps, {
        out: statement.name
      })?.lines ?? null
    )
  }

  if (deps.inferExpressionType(statement.init, context) !== 'crypto-hash') {
    if (deps.inferExpressionType(statement.init, context) !== 'crypto-hmac') {
      return null
    }

    const handle = emitPreparedCryptoHmacHandleExpression(statement.init, context, deps)

    context.variables.set(statement.name, 'crypto-hmac')

    return [...handle.lines, `ccjs_crypto_hmac* ${statement.name} = ${handle.expression};`]
  }

  const handle = emitPreparedCryptoHashHandleExpression(statement.init, context, deps)

  context.variables.set(statement.name, 'crypto-hash')

  return [...handle.lines, `ccjs_crypto_hash* ${statement.name} = ${handle.expression};`]
}

export function emitPreparedCryptoHashCallExpression(
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies,
  options: CryptoHandleOptions = {}
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression)

  if (method === 'createHash') {
    const algorithm = deps.emitPreparedStringBytesOperand(
      expression.args[0] ?? deps.cStringLiteralNode('', expression.loc),
      context,
      'ccjs_crypto_algorithm'
    )
    const out = options.out ?? nextCName(context, 'ccjs_crypto_hash')

    if (options.owned !== false) {
      registerOwnedCryptoHash(context, out)
    } else {
      context.variables.set(out, 'crypto-hash')
    }

    return {
      lines: [
        ...algorithm.lines,
        `ccjs_crypto_hash_free(${out});`,
        `${out} = 0;`,
        emitStatusCheck(
          `ccjs_crypto_hash_create(&ccjs_default_allocator, ${algorithm.bytes}, ${algorithm.length}, &${out})`,
          context
        )
      ],
      expression: out
    }
  }

  if (method !== 'Hash.update') {
    return null
  }

  const handle = emitPreparedCryptoHashHandleExpression(expression.callee.object, context, deps)
  const data = deps.emitCValueExpression(expression.args[0] ?? deps.cStringLiteralNode('', expression.loc), context)

  return {
    lines: [
      ...handle.lines,
      ...data.lines,
      emitStatusCheck(`ccjs_crypto_hash_update(${handle.expression}, ${data.expression})`, context)
    ],
    expression: handle.expression
  }
}

export function emitPreparedCryptoHmacCallExpression(
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies,
  options: CryptoHandleOptions = {}
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression)

  if (method === 'createHmac') {
    const algorithm = deps.emitPreparedStringBytesOperand(
      expression.args[0] ?? deps.cStringLiteralNode('', expression.loc),
      context,
      'ccjs_crypto_algorithm'
    )
    const key = deps.emitCValueExpression(expression.args[1] ?? deps.cStringLiteralNode('', expression.loc), context)
    const out = options.out ?? nextCName(context, 'ccjs_crypto_hmac')

    if (options.owned !== false) {
      registerOwnedCryptoHmac(context, out)
    } else {
      context.variables.set(out, 'crypto-hmac')
    }

    return {
      lines: [
        ...algorithm.lines,
        ...key.lines,
        `ccjs_crypto_hmac_free(${out});`,
        `${out} = 0;`,
        emitStatusCheck(
          `ccjs_crypto_hmac_create(&ccjs_default_allocator, ${algorithm.bytes}, ${algorithm.length}, ${key.expression}, &${out})`,
          context
        )
      ],
      expression: out
    }
  }

  if (method !== 'Hmac.update') {
    return null
  }

  const handle = emitPreparedCryptoHmacHandleExpression(expression.callee.object, context, deps)
  const data = deps.emitCValueExpression(expression.args[0] ?? deps.cStringLiteralNode('', expression.loc), context)

  return {
    lines: [
      ...handle.lines,
      ...data.lines,
      emitStatusCheck(`ccjs_crypto_hmac_update(${handle.expression}, ${data.expression})`, context)
    ],
    expression: handle.expression
  }
}

export function emitPreparedCryptoCallExpression(
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies,
  options: CryptoValueOptions = {}
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression)

  if (method == null || method === 'randomInt' || method === 'timingSafeEqual') {
    return null
  }

  if (method === 'createHash' || method === 'Hash.update' || method === 'createHmac' || method === 'Hmac.update') {
    return null
  }

  if (method === 'getHashes') {
    const out = nextCName(context, 'ccjs_crypto_hashes')
    registerOwnedValue(context, out)

    return {
      lines: [
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(`ccjs_crypto_get_hashes(&ccjs_default_allocator, &${out})`, context),
        emitRuntimeValueCheck(out, 'CCJS_TAG_ARRAY', context)
      ],
      expression: options.discard === true ? '' : out
    }
  }

  if (method === 'hash') {
    const algorithm = deps.emitPreparedStringBytesOperand(
      expression.args[0] ?? deps.cStringLiteralNode('', expression.loc),
      context,
      'ccjs_crypto_algorithm'
    )
    const data = deps.emitCValueExpression(expression.args[1] ?? deps.cStringLiteralNode('', expression.loc), context)
    const out = nextCName(context, 'ccjs_crypto_digest')
    const encoding = expression.cryptoHashDigestEncoding === 'bytes' ? 'bytes' : 'hex'
    const digestCall =
      encoding === 'hex'
        ? `ccjs_crypto_hash_oneshot_hex(&ccjs_default_allocator, ${algorithm.bytes}, ${algorithm.length}, ${data.expression}, &${out})`
        : `ccjs_crypto_hash_oneshot_bytes(&ccjs_default_allocator, ${algorithm.bytes}, ${algorithm.length}, ${data.expression}, &${out})`
    const expectedTag = encoding === 'hex' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_BYTES'

    registerOwnedValue(context, out)

    return {
      lines: [
        ...algorithm.lines,
        ...data.lines,
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(digestCall, context),
        emitRuntimeValueCheck(out, expectedTag, context)
      ],
      expression: options.discard === true ? '' : out
    }
  }

  if (method === 'Hash.digest' || method === 'Hmac.digest') {
    const isHmac = method === 'Hmac.digest'
    const handle = isHmac
      ? emitPreparedCryptoHmacHandleExpression(expression.callee.object, context, deps)
      : emitPreparedCryptoHashHandleExpression(expression.callee.object, context, deps)
    const out = nextCName(context, 'ccjs_crypto_digest')
    const encoding = expression.cryptoHashDigestEncoding === 'hex' ? 'hex' : 'bytes'
    const digestCall =
      encoding === 'hex'
        ? `ccjs_crypto_${isHmac ? 'hmac' : 'hash'}_digest_hex(&ccjs_default_allocator, ${handle.expression}, &${out})`
        : `ccjs_crypto_${isHmac ? 'hmac' : 'hash'}_digest_bytes(&ccjs_default_allocator, ${handle.expression}, &${out})`
    const expectedTag = encoding === 'hex' ? 'CCJS_TAG_STRING' : 'CCJS_TAG_BYTES'

    registerOwnedValue(context, out)

    return {
      lines: [
        ...handle.lines,
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(digestCall, context),
        emitRuntimeValueCheck(out, expectedTag, context)
      ],
      expression: options.discard === true ? '' : out
    }
  }

  if (method === 'getRandomValues' || method === 'randomFillSync') {
    const value = deps.emitCValueExpression(expression.args[0], context)
    const preparedCall =
      method === 'getRandomValues'
        ? { lines: [], call: `ccjs_crypto_get_random_values(${value.expression})` }
        : emitCryptoRandomFillCall(value.expression, expression, context, deps)

    if (options.discard === true) {
      return {
        lines: [...value.lines, ...preparedCall.lines, emitStatusCheck(preparedCall.call, context)],
        expression: ''
      }
    }

    const out = nextCName(context, 'ccjs_crypto_bytes')
    registerOwnedValue(context, out)

    return {
      lines: [
        ...value.lines,
        ...preparedCall.lines,
        emitStatusCheck(preparedCall.call, context),
        ...emitPrepareOwnedValueWrite(out),
        `${out} = ${value.expression};`,
        emitRuntimeValueCheck(out, 'CCJS_TAG_BYTES', context),
        `ccjs_retain(${out});`
      ],
      expression: out
    }
  }

  if (method === 'randomBytes') {
    const size = deps.emitPreparedNumberExpression(expression.args[0], context)
    const out = nextCName(context, 'ccjs_crypto_bytes')
    registerOwnedValue(context, out)

    return {
      lines: [
        ...size.lines,
        ...emitPrepareOwnedValueWrite(out),
        emitStatusCheck(`ccjs_crypto_random_bytes(&ccjs_default_allocator, ${size.expression}, &${out})`, context),
        emitRuntimeValueCheck(out, 'CCJS_TAG_BYTES', context)
      ],
      expression: options.discard === true ? '' : out
    }
  }

  const out = nextCName(context, 'ccjs_crypto_uuid')
  registerOwnedValue(context, out)

  return {
    lines: [
      ...emitPrepareOwnedValueWrite(out),
      emitStatusCheck(`ccjs_crypto_random_uuid(&ccjs_default_allocator, &${out})`, context),
      emitRuntimeValueCheck(out, 'CCJS_TAG_STRING', context)
    ],
    expression: options.discard === true ? '' : out
  }
}

export function emitPreparedCryptoNumberCallExpression(
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies
): PreparedExpression | null {
  const method = cryptoRuntimeMethodName(expression)

  if (method === 'timingSafeEqual') {
    const left = deps.emitCValueExpression(expression.args[0], context)
    const right = deps.emitCValueExpression(expression.args[1], context)
    const out = nextCName(context, 'ccjs_crypto_equal')

    return {
      lines: [
        ...left.lines,
        ...right.lines,
        `int ${out} = 0;`,
        emitStatusCheck(`ccjs_crypto_timing_safe_equal(${left.expression}, ${right.expression}, &${out})`, context)
      ],
      expression: out
    }
  }

  if (method !== 'randomInt') {
    return null
  }

  const min =
    expression.args.length === 1
      ? { lines: [], expression: '0' }
      : deps.emitPreparedNumberExpression(expression.args[0], context)
  const max = deps.emitPreparedNumberExpression(
    expression.args.length === 1 ? expression.args[0] : expression.args[1],
    context
  )
  const out = nextCName(context, 'ccjs_crypto_int')

  return {
    lines: [
      ...min.lines,
      ...max.lines,
      `ccjs_number ${out} = 0;`,
      emitStatusCheck(`ccjs_crypto_random_int(${min.expression}, ${max.expression}, &${out})`, context)
    ],
    expression: out
  }
}

export function emitPreparedCryptoHashHandleExpression(
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies
): PreparedExpression {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'crypto-hash') {
      return {
        lines: [],
        expression: name
      }
    }
  }

  if (expression?.type === 'CallExpression') {
    const call = emitPreparedCryptoHashCallExpression(expression, context, deps)

    if (call != null) {
      return call
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_CRYPTO_HASH',
      'this crypto hash expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

export function emitPreparedCryptoHmacHandleExpression(
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies
): PreparedExpression {
  if (expression?.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (context.variables.get(name) === 'crypto-hmac') {
      return {
        lines: [],
        expression: name
      }
    }
  }

  if (expression?.type === 'CallExpression') {
    const call = emitPreparedCryptoHmacCallExpression(expression, context, deps)

    if (call != null) {
      return call
    }
  }

  context.diagnostics.push(
    diagnostic(
      'CCJS_C_CRYPTO_HMAC',
      'this crypto hmac expression is not supported by the current C backend slice',
      expression?.loc
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitCryptoRandomFillCall(
  value: string,
  expression: any,
  context: any,
  deps: CryptoLoweringDependencies
): { lines: string[]; call: string } {
  const offset =
    expression.args[1] == null
      ? { lines: [], expression: '0' }
      : deps.emitPreparedNumberExpression(expression.args[1], context)
  const size =
    expression.args[2] == null
      ? { lines: [], expression: '0' }
      : deps.emitPreparedNumberExpression(expression.args[2], context)
  const hasSize = expression.args[2] == null ? '0' : '1'

  return {
    lines: [...offset.lines, ...size.lines],
    call: `ccjs_crypto_random_fill(${value}, ${offset.expression}, ${size.expression}, ${hasSize})`
  }
}
