import { emitRuntimeTypeCheck, type CFunctionContext } from './context.ts'

export function emitRuntimeNullableValueCheck(
  name: string,
  expectedTag: string | null,
  context: CFunctionContext
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

export function emitRuntimeValueCheck(name: string, expectedTag: string | null, context: CFunctionContext): string {
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
  expression: any,
  context: CFunctionContext
): string[] {
  if (expression?.nullable === true) {
    return emitRuntimeNullableValueCheck(value, expectedTag, context)
  }

  return [emitRuntimeValueCheck(value, expectedTag, context)].filter(Boolean)
}
