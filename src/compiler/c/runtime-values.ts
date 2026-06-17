import { emitRuntimeTypeCheck } from './context.ts'
import type { AnyNode } from '../types.ts'

type RuntimeValueCheckContext = {
  cleanupEnabled: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  statusReturn: boolean
  throwingFunction: boolean
  usedCleanupGoto: boolean
}

export function emitRuntimeNullableValueCheck(
  name: string,
  expectedTag: string | null,
  context: RuntimeValueCheckContext
): string[] {
  if (expectedTag == null) {
    return []
  }

  if (expectedTag === 'CCJS_TAG_BOOL' || expectedTag === 'CCJS_TAG_NUMBER') {
    return [emitRuntimeTypeCheck(`${name}.tag != CCJS_TAG_NULL && ${name}.tag != ${expectedTag}`, context)]
  }

  return [
    emitRuntimeTypeCheck(
      `${name}.tag != CCJS_TAG_NULL && (${name}.tag != ${expectedTag} || ${name}.as.ref == 0)`,
      context
    )
  ]
}

export function emitRuntimeValueCheck(name: string, expectedTag: string | null, context: RuntimeValueCheckContext): string {
  if (expectedTag == null) {
    return ''
  }

  if (expectedTag === 'CCJS_TAG_BOOL' || expectedTag === 'CCJS_TAG_NUMBER') {
    return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag}`, context)
  }

  return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag} || ${name}.as.ref == 0`, context)
}

export function emitRuntimeFieldValueCheck(
  value: string,
  expectedTag: string | null,
  expression: AnyNode,
  context: RuntimeValueCheckContext
): string[] {
  if (expression.nullable === true) {
    return emitRuntimeNullableValueCheck(value, expectedTag, context)
  }

  const check = emitRuntimeValueCheck(value, expectedTag, context)
  if (check === '') {
    return []
  }

  return [check]
}
