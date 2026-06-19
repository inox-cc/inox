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
  if (expectedTag === null || typeof expectedTag === 'undefined') {
    return []
  }

  if (expectedTag === 'INOX_TAG_BOOL' || expectedTag === 'INOX_TAG_NUMBER') {
    return [emitRuntimeTypeCheck(`${name}.tag != INOX_TAG_NULL && ${name}.tag != ${expectedTag}`, context)]
  }

  return [
    emitRuntimeTypeCheck(
      `${name}.tag != INOX_TAG_NULL && (${name}.tag != ${expectedTag} || ${name}.as.ref == 0)`,
      context
    )
  ]
}

export function emitRuntimeValueCheck(
  name: string,
  expectedTag: string | null,
  context: RuntimeValueCheckContext
): string {
  if (expectedTag === null || typeof expectedTag === 'undefined') {
    return ''
  }

  if (expectedTag === 'INOX_TAG_BOOL' || expectedTag === 'INOX_TAG_NUMBER') {
    return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag}`, context)
  }

  return emitRuntimeTypeCheck(`${name}.tag != ${expectedTag} || ${name}.as.ref == 0`, context)
}

export function emitRuntimeValueCheckLines(
  name: string,
  expectedTag: string | null,
  context: RuntimeValueCheckContext
): string[] {
  const check = emitRuntimeValueCheck(name, expectedTag, context)

  if (check === '') {
    return []
  }

  return [check]
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

  return emitRuntimeValueCheckLines(value, expectedTag, context)
}
