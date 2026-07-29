import type { AnyNode } from '../../types.ts'
import { emitRuntimeTypeCheck } from './context.ts'

type RuntimeValueCheckContext = {
  cleanupEnabled: boolean
  failureStatement?: string | null
  failureStatementUsed?: boolean
  statusReturn: boolean
}

export function runtimeObjectLikeTagMatchCondition(name: string): string {
  return `(${name}.tag == INOX_TAG_OBJECT || ${name}.tag == INOX_TAG_CLASS_INSTANCE)`
}

export function runtimeObjectLikeTagMismatchCondition(name: string): string {
  return `(${name}.tag != INOX_TAG_OBJECT && ${name}.tag != INOX_TAG_CLASS_INSTANCE)`
}

export function runtimeObjectLikeValueMismatchCondition(name: string): string {
  return `${runtimeObjectLikeTagMismatchCondition(name)} || ${name}.as.ref == 0`
}

export function runtimeExactObjectValueMismatchCondition(name: string): string {
  return `${name}.tag != INOX_TAG_OBJECT || ${name}.as.ref == 0`
}

export function runtimeExactObjectPointerMismatchCondition(name: string): string {
  return `${name}->tag != INOX_TAG_OBJECT || ${name}->as.ref == 0`
}

export function runtimeObjectApiValueMismatchCondition(name: string): string {
  return runtimeExactObjectValueMismatchCondition(name)
}

export function runtimeObjectReadValueMismatchCondition(name: string): string {
  return runtimeObjectLikeValueMismatchCondition(name)
}

export function runtimeErrorObjectValueMismatchCondition(name: string): string {
  return runtimeExactObjectValueMismatchCondition(name)
}

export function runtimeNullableErrorObjectPointerMismatchCondition(name: string): string {
  return `(${runtimeExactObjectPointerMismatchCondition(name)}) && ${name}->tag != INOX_TAG_NULL`
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
    return [
      emitRuntimeTypeCheck(
        `${name}.tag != INOX_TAG_UNDEFINED && ${name}.tag != INOX_TAG_NULL && ${name}.tag != ${expectedTag}`,
        context
      )
    ]
  }

  if (expectedTag === 'INOX_TAG_OBJECT') {
    return [
      emitRuntimeTypeCheck(
        `${name}.tag != INOX_TAG_UNDEFINED && ${name}.tag != INOX_TAG_NULL && ` +
          `(${runtimeObjectLikeValueMismatchCondition(name)})`,
        context
      )
    ]
  }

  return [
    emitRuntimeTypeCheck(
      `${name}.tag != INOX_TAG_UNDEFINED && ${name}.tag != INOX_TAG_NULL && (${name}.tag != ${expectedTag} || ${name}.as.ref == 0)`,
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

  if (expectedTag === 'INOX_TAG_OBJECT') {
    return emitRuntimeTypeCheck(runtimeObjectLikeValueMismatchCondition(name), context)
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
