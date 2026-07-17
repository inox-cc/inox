import { diagnostic } from '../diagnostics.ts'
import { memberExpressionPath } from '../member-paths.ts'
import { compilerLibraryNativeTypeForIntrinsic } from '../extensions/library-set.ts'
import { typeRefTraitArgument } from '../extensions/type-ref-compatibility.ts'
import { instantiateNativeTypeRef } from '../extensions/type-ref-substitution.ts'
import type { CompilerLibrarySet, TypeRef } from '../extensions/types.ts'
import type { AnyNode, Diagnostic, ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import type { DeclaredTypeResolverContext } from './declared-types.ts'
import { applyTypeRefMetadataToExpression } from './expression-metadata.ts'
import { objectValuesElementTypeFromShape } from './expression-helpers.ts'

export type GlobalCallCheckerContext = {
  declaredTypes: DeclaredTypeResolverContext
  diagnostics: Diagnostic[]
  libraries: CompilerLibrarySet
}

export type CheckedCallArgInfo = {
  valueType: ValueType
  nullable: boolean
  loc: SourceLocation
  shape: ObjectShapeInfo | null
  typeRef: TypeRef
}

function report(
  context: GlobalCallCheckerContext,
  code: string,
  message: string,
  loc: SourceLocation | null | undefined
): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: GlobalCallCheckerContext,
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

  report(context, 'INOX_TYPE_MISMATCH', `cannot assign ${actualLabel} to ${expected}`, loc)
}

export function isObjectStaticCall(expression: AnyNode, objectShadowed: boolean): boolean {
  const path = memberExpressionPath(expression.callee)

  return (
    path !== null &&
    typeof path !== 'undefined' &&
    path.length === 2 &&
    path[0] === 'Object' &&
    (path[1] === 'values' || path[1] === 'entries' || path[1] === 'keys') &&
    !objectShadowed
  )
}

export function checkObjectStaticCall(
  context: GlobalCallCheckerContext,
  expression: AnyNode,
  argInfos: CheckedCallArgInfo[]
): ValueType {
  const path = memberExpressionPath(expression.callee)
  const method = path[1]

  expression.objectRuntimeMethod = method
  expression.valueType = 'array'
  let elementTypeRef = unknownTypeRef()

  if (method === 'entries') {
    elementTypeRef = arrayTypeRef(context, unknownTypeRef()) ?? unknownTypeRef()
  } else if (method === 'keys') {
    elementTypeRef = typeRefForValueType(context, 'string')
  }

  if (expression.args.length !== 1) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function Object.${method} expects 1 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (argInfos.length > 0) {
    const firstArg = argInfos[0]

    if (firstArg.valueType !== 'unknown' && firstArg.valueType !== 'object' && firstArg.valueType !== 'array') {
      report(context, 'INOX_TYPE_MISMATCH', `function Object.${method} expects an object or array argument`, firstArg.loc)
    }

    if (method === 'values') {
      if (firstArg.valueType === 'array') {
        elementTypeRef = typeRefTraitArgument(firstArg.typeRef, 'iterable', 0, context.libraries) ?? unknownTypeRef()
      } else {
        elementTypeRef = typeRefForValueType(context, objectValuesElementTypeFromShape(firstArg.shape))
      }
    }
  }

  applyArrayResultType(context, expression, elementTypeRef)

  return 'array'
}

function applyArrayResultType(
  context: GlobalCallCheckerContext,
  expression: AnyNode,
  elementTypeRef: TypeRef
): void {
  const providerType = compilerLibraryNativeTypeForIntrinsic(context.libraries, 'array-literal', 'construct')
  const resultTypeRef = arrayTypeRef(context, elementTypeRef)

  if (providerType === null || resultTypeRef === null) {
    return
  }

  applyTypeRefMetadataToExpression(context.declaredTypes, expression, resultTypeRef)
  expression.libraryRuntimeRequirements = providerType.runtimeRequirements
}

function arrayTypeRef(context: GlobalCallCheckerContext, elementTypeRef: TypeRef): TypeRef | null {
  const providerType = compilerLibraryNativeTypeForIntrinsic(context.libraries, 'array-literal', 'construct')

  if (providerType === null || (providerType.typeParameters ?? []).length !== 1) {
    return null
  }

  return instantiateNativeTypeRef(providerType, [elementTypeRef])
}

function typeRefForValueType(context: GlobalCallCheckerContext, valueType: ValueType): TypeRef {
  const primitiveTypeRef = primitiveTypeRefForValueType(valueType)

  if (primitiveTypeRef !== null) {
    return primitiveTypeRef
  }

  if (valueType === 'array') {
    return arrayTypeRef(context, unknownTypeRef()) ?? unknownTypeRef()
  }

  return unknownTypeRef()
}

function primitiveTypeRefForValueType(valueType: ValueType): TypeRef | null {
  if (
    valueType !== 'boolean' &&
    valueType !== 'bytes' &&
    valueType !== 'null' &&
    valueType !== 'number' &&
    valueType !== 'string' &&
    valueType !== 'void'
  ) {
    return null
  }

  return {
    kind: 'primitive',
    name: valueType,
    nullable: false,
    ownership: 'value',
    traits: []
  }
}

function unknownTypeRef(): TypeRef {
  return {
    kind: 'unknown',
    nullable: false,
    ownership: 'value',
    traits: []
  }
}
