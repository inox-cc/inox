import type { AnyNode } from '../../../types.ts'
import type {
  CAsyncCoroutineWrapper,
  CCallbackWrapper,
  CCompilerLibrarySet,
  CFunctionParam,
  CRuntimeArrowCallbackWrapper
} from '../types.ts'
import { isManagedRuntimeReturnType, libraryNativeBoundaryCppType } from '../value-types.ts'

type AsyncCoroutineCollectionContext = {
  libraries: CCompilerLibrarySet
}

export function collectAsyncCoroutineWrappers(
  context: AsyncCoroutineCollectionContext,
  callbackWrappers: Map<string, CCallbackWrapper> | null = null
): Map<string, CAsyncCoroutineWrapper> {
  const wrappers = new Map<string, CAsyncCoroutineWrapper>()

  if (callbackWrappers === null) {
    return wrappers
  }

  for (const callback of callbackWrappers.values()) {
    if (callback.kind !== 'arrow' || callback.expression.async !== true) {
      continue
    }

    const wrapper = createAsyncCallbackCoroutineWrapper(callback, context.libraries)
    wrappers.set(callback.name, wrapper)
  }

  return wrappers
}

function createAsyncCallbackCoroutineWrapper(
  callback: CRuntimeArrowCallbackWrapper,
  libraries: CCompilerLibrarySet
): CAsyncCoroutineWrapper {
  const params = createAsyncCallbackCoroutineParams(callback, libraries)
  const returnType = callbackAsyncResultValueType(callback)
  const coroutineNode: AnyNode = {
    ...callback.expression,
    type: 'FunctionDeclaration',
    name: `${callback.name}_coroutine`,
    async: true,
    params,
    body: createAsyncCallbackCoroutineBody(callback, returnType),
    returnType,
    returnNullable: false
  }

  return {
    coroutineNode
  }
}

function createAsyncCallbackCoroutineParams(
  callback: CRuntimeArrowCallbackWrapper,
  libraries: CCompilerLibrarySet
): CFunctionParam[] {
  const params: CFunctionParam[] = []
  const expressionParams: AnyNode[] = callback.expression.params ?? []

  for (let index = 0; index < callback.functionType.params.length; index = index + 1) {
    const source = callback.functionType.params[index]
    const expressionParam = expressionParams[index]
    const name = expressionParam?.name ?? source.name
    const cppType = libraryNativeBoundaryCppType(
      source.valueType,
      source.nullable === true,
      source.optional === true,
      source.shape
    )

    params.push({
      ...source,
      name,
      coroutineStorageKind: callbackParamStorageKind(source.valueType, cppType)
    })
  }

  for (const capture of callback.captures) {
    const cppType = libraryNativeBoundaryCppType(capture.valueType, false, false, capture.shape)
    let coroutineStorageKind = callbackParamStorageKind(capture.valueType, cppType)

    if (capture.mutable === true) {
      coroutineStorageKind =
        capture.valueType === 'number' || capture.valueType === 'boolean' ? 'boxed-number' : 'boxed-value'
    }

    params.push({
      name: capture.name,
      valueType: capture.valueType,
      functionType: capture.functionType,
      shape: capture.shape,
      coroutineStorageKind
    })
  }

  return params
}

function callbackParamStorageKind(
  valueType: string,
  cppType: string | null
): CFunctionParam['coroutineStorageKind'] {
  if (cppType !== null) {
    return null
  }

  if (valueType === 'function') {
    return 'runtime-value'
  }

  if (isManagedRuntimeReturnType(valueType)) {
    return 'runtime-value'
  }

  return null
}

function callbackAsyncResultValueType(callback: CRuntimeArrowCallbackWrapper): string {
  const valueType = callback.expression.returnAsyncResultValueType

  if (valueType !== null && typeof valueType !== 'undefined') {
    return valueType
  }

  return 'void'
}

function createAsyncCallbackCoroutineBody(
  callback: CRuntimeArrowCallbackWrapper,
  returnType: string
): AnyNode[] {
  if (callback.expression.expressionBody === true) {
    if (returnType === 'void') {
      return [
        {
          type: 'ExpressionStatement',
          expression: callback.expression.body,
          loc: callback.expression.loc
        }
      ]
    }

    return [
      {
        type: 'ReturnStatement',
        argument: callback.expression.body,
        loc: callback.expression.loc
      }
    ]
  }

  if (Array.isArray(callback.expression.body)) {
    return callback.expression.body
  }

  return callback.expression.body?.body ?? []
}
