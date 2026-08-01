import { diagnostic } from '../../../diagnostics.ts'
import { irClassMethodEffectName } from '../../../ir.ts'
import type { AnyNode, Diagnostic, IrProgram, SourceLocation } from '../../../types.ts'
import { isRuntimeFunctionType } from '../async/callbacks.ts'
import { functionTakesEventLoopParam } from '../async/async-results.ts'
import type {
  CEmitContextWithDependencies,
  CEventLoopContext,
  CFailureContext,
  CNameContext,
  COwnedAsyncResultContext,
  COwnedValueContext
} from '../context.ts'
import {
  emitFailureStatement,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedAsyncResult,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../runtime-values.ts'
import {
  runtimeTypeAlternativeValidExpressions,
  runtimeTypeAlternativesAreNullable
} from '../runtime-type-alternatives.ts'
import type {
  CClassInfo,
  CClassMethod,
  CFunctionParam,
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import { cTypeRefValue, isReadonlyCObjectShapeField } from '../types.ts'
import {
  emitCType,
  cRuntimeValueTag,
  compilerLibraryNativeRuntimeValueExpressionForId,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType,
  libraryNativeBoundaryCppType,
  libraryNativeCppType,
  requireCompilerLibraryAsyncResultCppType
} from '../value-types.ts'
import { emitObjectValueReference, resolveCObjectExpressionName } from './objects.ts'
import { collectTemplatePlaceholderExpressions } from './strings.ts'

type CEmitContext = CEmitContextWithDependencies<object, object, object, object, object>

export type ClassLoweringDependencies = {
  emitCFieldFlags(field: CObjectShapeField): string
  emitCValueExpression(expression: AnyNode, context: ClassFunctionContext): PreparedExpression
  emitPreparedCallArgs(expression: AnyNode, params: CFunctionParam[], context: ClassFunctionContext): PreparedCallArgs
  emitRuntimeCallbackValue(
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    context: ClassFunctionContext
  ): PreparedExpression
}

type ClassMethodCallInfo = {
  accessOperator: string
  info: CClassInfo
  methodName: string
  native: boolean
  objectExpression: string
  objectLines: string[]
}

type CClassInfoMap = Map<string, CClassInfo>
type CClassMethodMap = Map<string, AnyNode>
type CConstructorArgMap = Map<string, AnyNode>
type CStringSet = Set<string>
type ClassExpressionNode = AnyNode
type ClassMaybeNode = AnyNode | null | undefined

type ClassEmitContext = {
  classInfos: CClassInfoMap
  diagnostics: Diagnostic[]
}
export type ClassInfoLookupContext = {
  classInfos: CClassInfoMap
}
type ClassPhysicalTypeContext = ClassInfoLookupContext & {
  libraries: CEmitContext['libraries']
}
type ClassDescriptorScanScope = {
  className: string | null
  functions: Map<string, CFunctionParam[]>
  returnValueType: string | null
  variables: Map<string, string>
}

type ClassFunctionContext = CFailureContext &
  CNameContext &
  CEventLoopContext &
  COwnedValueContext &
  COwnedAsyncResultContext & {
    classInfos: CClassInfoMap
    classInstanceTypes: Map<string, string>
    classLoweringDependencies: ClassLoweringDependencies
    boxedVariables: Set<string>
    diagnostics: Diagnostic[]
    errorChannelUsed: boolean
    errorTargets: string[]
    externalEventLoopFunctions: Set<string>
    functionAsyncFlags: Map<string, boolean>
    functionReturnTypes: Map<string, string>
    libraries: CEmitContext['libraries']
    localValueNames: Set<string>
    moduleValueNames: Map<string, string>
    moduleValueTypes: Map<string, string>
    objectShapes: Map<string, CObjectShapeField[]>
    pendingExceptionFunctions: Set<string>
    runtimeStringValues: Map<string, string>
    throwingFunctions: Set<string>
    variables: Map<string, string>
  }
type ClassLookupContext = {
  classInfos: CClassInfoMap
  classInstanceTypes: Map<string, string>
  localValueNames: Set<string>
  moduleValueNames: Map<string, string>
  moduleValueTypes: Map<string, string>
  variables: Map<string, string>
}
type CNativeClassReceiver = {
  accessOperator: string
  className: string
  expression: string
  lines: string[]
}

type CNativeClassFieldAccess = {
  accessOperator: string
  field: CObjectShapeField
  info: CClassInfo
  objectExpression: string
  reference: string
}

type ClassInstanceRefValueContext = CFailureContext & CNameContext & COwnedValueContext & ClassInfoLookupContext

export type CNativeClassInstanceExpression = {
  expression: string
  info: CClassInfo
  lines: string[]
}

export type CClassMethodPrototypeMap = Map<string, string[]>
export type CClassDescriptorNameSet = Set<string>
export type CClassInlineDefinitionMap = Map<string, string[]>

export function cClassUsesInlineDefinitions(info: CClassInfo): boolean {
  return info.native && info.node.exported !== true
}

export function cClassInlineMethodDefinitionKey(info: CClassInfo, method: AnyNode): string {
  return `${info.name}:${method.name}`
}

function emitFallbackClassValueExpression(
  _expression: ClassExpressionNode,
  _context: ClassFunctionContext
): PreparedExpression {
  return {
    lines: [],
    expression: 'inox_undefined_value()'
  }
}

function emitFallbackPreparedClassCallArgs(
  _expression: ClassExpressionNode,
  _params: CFunctionParam[],
  _context: ClassFunctionContext
): PreparedCallArgs {
  return {
    lines: [],
    args: []
  }
}

function emitFallbackClassFieldFlags(_field: CObjectShapeField): string {
  return '0'
}

function emitClassFieldFlags(context: ClassFunctionContext, field: CObjectShapeField): string {
  const deps = context.classLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.emitCFieldFlags(field)
  }

  context.diagnostics.push(diagnostic('INOX_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackClassFieldFlags(field)
}

function emitClassValueExpression(context: ClassFunctionContext, expression: ClassExpressionNode): PreparedExpression {
  const deps = context.classLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.emitCValueExpression(expression, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackClassValueExpression(expression, context)
}

function emitClassRuntimeCallbackValue(
  context: ClassFunctionContext,
  expression: ClassExpressionNode,
  functionType: CFunctionType | null | undefined
): PreparedExpression {
  const deps = context.classLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.emitRuntimeCallbackValue(expression, functionType, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackClassValueExpression(expression, context)
}

function emitPreparedClassCallArgs(
  context: ClassFunctionContext,
  expression: ClassExpressionNode,
  params: CFunctionParam[]
): PreparedCallArgs {
  const deps = context.classLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps.emitPreparedCallArgs(expression, params, context)
  }

  context.diagnostics.push(diagnostic('INOX_C_CLASS', 'class lowering dependencies are not configured'))

  return emitFallbackPreparedClassCallArgs(expression, params, context)
}

function createClassInfoMap(): CClassInfoMap {
  return new Map()
}

function createClassMethodMap(): CClassMethodMap {
  return new Map()
}

function createConstructorArgMap(): CConstructorArgMap {
  return new Map()
}

function createStringSet(): CStringSet {
  return new Set()
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function joinStrings(values: string[], separator: string): string {
  let result = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      result = result + separator
    }

    result = result + values[index]
  }

  return result
}

function stringOrNull(value: string | null | undefined): string | null {
  if (typeof value === 'string') {
    return value
  }

  return null
}

function classNodeOrNull(value: AnyNode | AnyNode[] | null | undefined): AnyNode | null {
  if (value === null || typeof value === 'undefined' || Array.isArray(value)) {
    return null
  }

  return value
}

function classNodeArray(value: AnyNode | AnyNode[] | null | undefined): AnyNode[] {
  if (Array.isArray(value)) {
    return value
  }

  return []
}

function classFieldOwnership(field: CObjectShapeField): string {
  const ownership = field.ownership

  if (ownership !== null && typeof ownership !== 'undefined') {
    return ownership
  }

  return 'strong'
}

export function cClassValueTypeName(className: string): string {
  return `class:${className}`
}

export function cClassNameFromValueType(valueType: string | null | undefined): string | null {
  if (valueType === null || typeof valueType === 'undefined' || !valueType.startsWith('class:')) {
    return null
  }

  return valueType.slice('class:'.length)
}

export function emitCClassTypeName(className: string): string {
  return emitCIdentifier(className)
}

export function emitCClassInfoTypeName(info: CClassInfo): string {
  return emitCClassTypeName(info.symbolName)
}

function emitCClassFieldName(name: string): string {
  return emitCIdentifier(name)
}

function emitCClassMethodIdentifier(name: string): string {
  return emitCIdentifier(name)
}

export function emitCClassMethodName(className: string, methodName: string): string {
  return `inox_method_${emitCIdentifier(className)}_${emitCIdentifier(methodName)}`
}

export function emitCClassInfoMethodName(info: CClassInfo, methodName: string): string {
  return emitCClassMethodName(info.symbolName, methodName)
}

export function emitCClassDescriptorName(className: string): string {
  return `inox_class_descriptor_${emitCIdentifier(className)}`
}

export function emitCClassInfoDescriptorName(info: CClassInfo): string {
  return `${emitCClassInfoTypeName(info)}::inox_descriptor`
}

export function emitCClassTypeNameForClassName(context: ClassInfoLookupContext, className: string): string {
  const info = context.classInfos.get(className)

  if (info !== null && typeof info !== 'undefined') {
    return emitCClassInfoTypeName(info)
  }

  return emitCClassTypeName(className)
}

export function emitCClassDescriptorNameForClassName(context: ClassInfoLookupContext, className: string): string {
  const info = context.classInfos.get(className)

  if (info !== null && typeof info !== 'undefined') {
    return emitCClassInfoDescriptorName(info)
  }

  return emitCClassDescriptorName(className)
}

export function emitPreparedClassInstanceRefValueExpression(
  value: PreparedExpression,
  context: ClassInstanceRefValueContext
): PreparedExpression | null {
  const className = cClassNameFromValueType(value.valueType)

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const temp = nextCName(context, 'inox_class_instance')
  const lines: string[] = []

  registerOwnedValue(context, temp)
  lines.push(
    emitStatusCheck(
      `inox_class_instance_ref_copy(&inox_default_allocator, &${emitCClassDescriptorNameForClassName(
        context,
        className
      )}, &${value.expression}, ${temp}.out())`,
      context
    )
  )

  return {
    lines,
    expression: temp,
    valueType: 'object'
  }
}

function classValueType(info: CClassInfo): string {
  return cClassValueTypeName(info.name)
}

function classFieldUsesRuntimeValueStorage(field: CObjectShapeField): boolean {
  if (classFieldUsesNativeClassStorage(field)) {
    return false
  }

  if (classFieldLibraryNativeCppType(field) !== null) {
    return false
  }

  if (classFieldUsesCppStringStorage(field)) {
    return false
  }

  if (field.className !== null && typeof field.className !== 'undefined') {
    return false
  }

  return (
    field.valueType === 'unknown' ||
    isManagedRuntimeReturnType(field.valueType) ||
    isOpaqueRuntimeValueType(field.valueType) ||
    (field.nullable === true && isNullableScalarType(field.valueType))
  )
}

export function classFieldUsesCppStringStorage(field: CObjectShapeField): boolean {
  return (
    field.valueType === 'string' &&
    field.nullable !== true &&
    (field.className === null || typeof field.className === 'undefined')
  )
}

export function classParamUsesCppValueStorage(param: CFunctionParam): boolean {
  if (param.className !== null && typeof param.className !== 'undefined') {
    return false
  }

  if (classParamLibraryNativeCppType(param) !== null) {
    return false
  }

  if (classParamUsesCppStringStorage(param)) {
    return false
  }

  return (
    param.valueType === 'unknown' ||
    isManagedRuntimeReturnType(param.valueType) ||
    isOpaqueRuntimeValueType(param.valueType)
  )
}

export function classParamUsesCppStringStorage(param: CFunctionParam): boolean {
  return (
    param.valueType === 'string' &&
    param.nullable !== true &&
    (param.className === null || typeof param.className === 'undefined')
  )
}

function classParamNeedsGenericConstructorArgLowering(param: CFunctionParam): boolean {
  return classObjectShapeHasFunctionFields(param.shape, classConstructorSeenTypes())
}

function classObjectShapeHasFunctionFields(shape: CObjectShape | null | undefined, seenTypes: string[]): boolean {
  if (shape === null || typeof shape === 'undefined') {
    return false
  }

  if (shape.fields === null || typeof shape.fields === 'undefined') {
    return false
  }

  const fields: CObjectShapeField[] = shape.fields

  for (const field of fields) {
    if (field.valueType === 'function') {
      return true
    }

    if (field.valueType === 'object' && field.shape !== null && typeof field.shape !== 'undefined') {
      if (classConstructorSeenTypesInclude(seenTypes, field.declaredType)) {
        continue
      }

      const pushedTypes = pushClassConstructorSeenType(seenTypes, field.declaredType)
      const hasFunctionFields = classObjectShapeHasFunctionFields(field.shape, seenTypes)

      popClassConstructorSeenTypes(seenTypes, pushedTypes)

      if (hasFunctionFields) {
        return true
      }
    }
  }

  return false
}

export function classInfosUseCppValueRuntime(context: ClassInfoLookupContext): boolean {
  for (const info of context.classInfos.values()) {
    if (!info.native) {
      continue
    }

    for (const field of info.fields) {
      if (classFieldUsesRuntimeValueStorage(field) || classFieldUsesCppStringStorage(field)) {
        return true
      }
    }
  }

  return false
}

function classFieldUsesNativeClassStorage(field: CObjectShapeField): boolean {
  return (
    field.className !== null &&
    typeof field.className !== 'undefined' &&
    field.nullable !== true &&
    field.ownership !== 'weak'
  )
}

function classFieldLibraryNativeCppType(field: CObjectShapeField): string | null {
  const typeRef = cTypeRefValue(field.typeRef)

  if (typeRef === null || typeRef.kind !== 'nominal' || typeRef.nullable || typeRef.ownership === 'weak') {
    return null
  }

  const shapeTypeId = field.shape?.libraryTypeId

  if (shapeTypeId !== typeRef.typeId) {
    return null
  }

  return libraryNativeCppType(field.shape)
}

function classCanUseNativeLowering(fields: CObjectShapeField[]): boolean {
  for (const field of fields) {
    if (!classFieldSupportsNativeLowering(field)) {
      return false
    }
  }

  return true
}

function classFieldSupportsNativeLowering(field: CObjectShapeField): boolean {
  if (classFieldUsesNativeClassStorage(field)) {
    return true
  }

  if (classFieldLibraryNativeCppType(field) !== null) {
    return true
  }

  if (field.valueType === 'number' || field.valueType === 'boolean' || field.valueType === 'string') {
    return true
  }

  return field.valueType === 'object'
}

function emitCClassFieldType(field: CObjectShapeField, context: ClassInfoLookupContext): string {
  if (classFieldUsesNativeClassStorage(field)) {
    return emitCClassTypeNameForClassName(context, field.className)
  }

  const libraryCppType = classFieldLibraryNativeCppType(field)

  if (libraryCppType !== null) {
    return libraryCppType
  }

  if (classFieldUsesCppStringStorage(field)) {
    return 'inox::String'
  }

  if (classFieldUsesRuntimeValueStorage(field)) {
    return 'inox::Value'
  }

  return emitCType(field.valueType)
}

function emitCClassFieldDefaultValue(field: CObjectShapeField, context: ClassInfoLookupContext): string {
  if (classFieldUsesNativeClassStorage(field)) {
    return emitCClassTypeNameForClassName(context, field.className) + '()'
  }

  const libraryCppType = classFieldLibraryNativeCppType(field)

  if (libraryCppType !== null) {
    return libraryCppType + '()'
  }

  if (classFieldUsesRuntimeValueStorage(field)) {
    return 'inox::Value()'
  }

  if (classFieldUsesCppStringStorage(field)) {
    return 'inox::String()'
  }

  if (field.className !== null && typeof field.className !== 'undefined') {
    return 'inox_undefined_value()'
  }

  return '0'
}

function emitCClassParamType(param: CFunctionParam, context: ClassPhysicalTypeContext): string {
  if (
    param.className !== null &&
    typeof param.className !== 'undefined' &&
    param.nullable !== true &&
    param.ownership !== 'weak'
  ) {
    return 'const ' + emitCClassTypeNameForClassName(context, param.className) + '&'
  }

  const libraryCppType = classParamPhysicalCppType(param, context)

  if (libraryCppType !== null) {
    return libraryCppType
  }

  if (classParamUsesCppValueStorage(param)) {
    return 'const inox::Value&'
  }

  if (classParamUsesCppStringStorage(param)) {
    return 'const inox::String&'
  }

  return emitCType(param.valueType)
}

function classParamLibraryNativeCppType(param: CFunctionParam): string | null {
  return libraryNativeBoundaryCppType(param.valueType, param.nullable === true, param.optional === true, param.shape)
}

function classParamPhysicalCppType(param: CFunctionParam, context: ClassPhysicalTypeContext): string | null {
  const cppType = classParamLibraryNativeCppType(param)

  if (cppType !== null || param.valueType !== 'async-result') {
    return cppType
  }

  return requireCompilerLibraryAsyncResultCppType(context.libraries, param.typeRef)
}

function emitCClassParamName(param: CFunctionParam): string {
  if (
    param.className !== null &&
    typeof param.className !== 'undefined' &&
    param.nullable !== true &&
    param.ownership !== 'weak'
  ) {
    return emitCIdentifier(param.name)
  }

  if (classParamUsesCppValueStorage(param)) {
    return emitCIdentifier(param.name)
  }

  if (classParamUsesCppStringStorage(param)) {
    return emitCIdentifier(param.name)
  }

  return emitCIdentifier(param.name)
}

function emitCClassParamDeclaration(param: CFunctionParam, context: ClassPhysicalTypeContext): string {
  return `${emitCClassParamType(param, context)} ${emitCClassParamName(param)}`
}

function emitCClassParamDeclarations(params: CFunctionParam[], context: ClassPhysicalTypeContext): string {
  const declarations: string[] = []

  for (const param of params) {
    declarations.push(emitCClassParamDeclaration(param, context))
  }

  return joinStrings(declarations, ', ')
}

function classConstructorSeenTypes(): string[] {
  return []
}

function classConstructorSeenTypesInclude(seenTypes: string[], type: string | null | undefined): boolean {
  if (type === null || typeof type === 'undefined' || type === '') {
    return false
  }

  for (const seen of seenTypes) {
    if (seen === type) {
      return true
    }
  }

  return false
}

function pushClassConstructorSeenType(seenTypes: string[], type: string | null | undefined): number {
  if (type === null || typeof type === 'undefined' || type === '') {
    return 0
  }

  seenTypes.push(type)
  return 1
}

function popClassConstructorSeenTypes(seenTypes: string[], count: number): void {
  for (let index = 0; index < count; index = index + 1) {
    seenTypes.pop()
  }
}

function emitCClassFieldWriteLines(target: string, value: string, field: CObjectShapeField): string[] {
  if (!classFieldUsesRuntimeValueStorage(field)) {
    return [`${target} = ${value};`]
  }

  return [`${target} = ${value};`]
}

function cppValueRuntimeStringReference(expression: AnyNode, context: ClassFunctionContext): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  const reference = emitCIdentifier(name)
  const runtimeValue = context.runtimeStringValues.get(name)

  if (runtimeValue !== `${reference}.raw()`) {
    return null
  }

  return reference
}

function emitCClassConstructorInitializers(
  info: CClassInfo,
  context: ClassInfoLookupContext,
  fieldInitializers?: Map<string, string> | null
): string {
  const initializers: string[] = []

  for (const field of info.fields) {
    if (classFieldUsesRuntimeValueStorage(field)) {
      continue
    }

    let initializer = emitCClassFieldDefaultValue(field, context)

    if (fieldInitializers !== null && typeof fieldInitializers !== 'undefined') {
      const fieldInitializer = fieldInitializers.get(field.name)

      if (fieldInitializer !== null && typeof fieldInitializer !== 'undefined') {
        initializer = fieldInitializer
      }
    }

    initializers.push(`${emitCClassFieldName(field.name)}(${initializer})`)
  }

  if (initializers.length === 0) {
    return ''
  }

  return ` : ${joinStrings(initializers, ', ')}`
}

function emitCClassDefaultConstructor(info: CClassInfo, context: ClassInfoLookupContext): string {
  return `${emitCClassInfoTypeName(info)}()${emitCClassConstructorInitializers(info, context)} {}`
}

export function emitCClassConstructorPrototype(info: CClassInfo, context: ClassPhysicalTypeContext): string | null {
  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return null
  }

  const params: CFunctionParam[] = constructorMethod.params

  return `${emitCClassInfoTypeName(info)}(${emitCClassParamDeclarations(params, context)});`
}

export function emitCClassConstructorHead(
  info: CClassInfo,
  context: ClassPhysicalTypeContext,
  fieldInitializers?: Map<string, string> | null,
  inClass: boolean = false
): string | null {
  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return null
  }

  const params: CFunctionParam[] = constructorMethod.params
  const typeName = emitCClassInfoTypeName(info)
  const paramDeclarations = emitCClassParamDeclarations(params, context)
  const initializers = emitCClassConstructorInitializers(info, context, fieldInitializers)

  const name = inClass ? typeName : typeName + '::' + typeName

  return name + '(' + paramDeclarations + ')' + initializers
}

export function emitCNativeClassDeclarations(
  context: CEmitContext,
  methodPrototypes: CClassMethodPrototypeMap,
  descriptorNames: CClassDescriptorNameSet,
  inlineConstructorDefinitions: CClassInlineDefinitionMap | null = null,
  inlineMethodDefinitions: CClassInlineDefinitionMap | null = null,
  includedClassNames: Set<string> | null = null,
  omittedSyntheticDefaultConstructors: Set<string> | null = null
): string[] {
  const lines: string[] = []
  const infos = orderCNativeClassInfos(
    context,
    methodPrototypes,
    inlineConstructorDefinitions,
    inlineMethodDefinitions,
    includedClassNames
  )

  for (const info of infos) {
    const typeName = emitCClassInfoTypeName(info)
    const descriptorNeeded = descriptorNames.has(info.name)

    if (descriptorNeeded) {
      lines.push(`class ${typeName} : public inox::Class<${typeName}> {`)
    } else {
      lines.push(`class ${typeName} {`)
    }

    lines.push('public:')

    if (descriptorNeeded) {
      lines.push(`  static constexpr uint32_t inox_field_count = ${info.fields.length};`)

      if (info.fields.length === 0) {
        lines.push('  static constexpr const inox_class_field_descriptor* inox_fields = nullptr;')
      } else {
        lines.push('  static const inox_class_field_descriptor inox_fields[];')
      }

      lines.push('  static const inox_class_descriptor inox_descriptor;')

      if (cClassUsesInlineDefinitions(info)) {
        pushIndentedCClassDefinition(lines, emitCClassDescriptorFieldReaderDeclaration(info, context, true))
      } else {
        lines.push(`  static inox_status inox_read_field(const ${typeName}& value, uint32_t index, inox_value* out);`)
      }

      lines.push('')
    }

    for (const field of info.fields) {
      lines.push(`  ${emitCClassFieldType(field, context)} ${emitCClassFieldName(field.name)};`)
    }

    if (info.fields.length > 0) {
      lines.push('')
    }

    const constructorPrototype = emitCClassConstructorPrototype(info, context)
    const inlineConstructorDefinition = inlineConstructorDefinitions?.get(info.name)

    if (constructorPrototype !== null && typeof constructorPrototype !== 'undefined') {
      if (
        !classHasNoArgConstructor(info) &&
        (omittedSyntheticDefaultConstructors === null || !omittedSyntheticDefaultConstructors.has(info.name))
      ) {
        lines.push(`  ${emitCClassDefaultConstructor(info, context)}`)
      }

      if (inlineConstructorDefinition !== null && typeof inlineConstructorDefinition !== 'undefined') {
        pushIndentedCClassDefinition(lines, inlineConstructorDefinition)
      } else {
        lines.push(`  ${constructorPrototype}`)
      }
    } else {
      lines.push(`  ${emitCClassDefaultConstructor(info, context)}`)
    }

    const prototypes = methodPrototypes.get(info.name)

    if (prototypes !== null && typeof prototypes !== 'undefined') {
      if (inlineMethodDefinitions !== null) {
        let prototypeIndex = 0

        for (const method of info.methods.values()) {
          const definition = inlineMethodDefinitions.get(cClassInlineMethodDefinitionKey(info, method))

          if (definition !== null && typeof definition !== 'undefined') {
            lines.push('')
            pushIndentedCClassDefinition(lines, definition)
          } else {
            lines.push(`  ${prototypes[prototypeIndex]}`)
          }

          prototypeIndex = prototypeIndex + 1
        }
      } else {
        for (const prototype of prototypes) {
          lines.push(`  ${prototype}`)
        }
      }
    }

    lines.push('};')
    lines.push('')
  }

  return lines
}

function orderCNativeClassInfos(
  context: CEmitContext,
  methodPrototypes: CClassMethodPrototypeMap,
  inlineConstructorDefinitions: CClassInlineDefinitionMap | null,
  inlineMethodDefinitions: CClassInlineDefinitionMap | null,
  includedClassNames: Set<string> | null
): CClassInfo[] {
  const infos: CClassInfo[] = []

  for (const info of context.classInfos.values()) {
    if (!info.native) {
      continue
    }

    if (includedClassNames !== null && !includedClassNames.has(info.name)) {
      continue
    }

    infos.push(info)
  }

  const result: CClassInfo[] = []
  const visiting: Set<string> = new Set()
  const visited: Set<string> = new Set()

  for (const info of infos) {
    visitCNativeClassDefinition(
      info,
      infos,
      context,
      methodPrototypes,
      inlineConstructorDefinitions,
      inlineMethodDefinitions,
      visiting,
      visited,
      result
    )
  }

  return result
}

function collectCNativeClassDefinitionDependencyLines(
  info: CClassInfo,
  context: CEmitContext,
  methodPrototypes: CClassMethodPrototypeMap,
  inlineConstructorDefinitions: CClassInlineDefinitionMap | null,
  inlineMethodDefinitions: CClassInlineDefinitionMap | null
): string[] {
  const lines: string[] = []

  for (const field of info.fields) {
    lines.push(emitCClassFieldType(field, context))
  }

  const constructorPrototype = emitCClassConstructorPrototype(info, context)

  if (constructorPrototype !== null && typeof constructorPrototype !== 'undefined') {
    lines.push(constructorPrototype)
  }

  const prototypes = methodPrototypes.get(info.name)

  if (prototypes !== null && typeof prototypes !== 'undefined') {
    pushAllLines(lines, prototypes)
  }

  const constructorDefinition = inlineConstructorDefinitions?.get(info.name)

  if (constructorDefinition !== null && typeof constructorDefinition !== 'undefined') {
    pushAllLines(lines, constructorDefinition)
  }

  if (inlineMethodDefinitions !== null) {
    for (const method of info.methods.values()) {
      const definition = inlineMethodDefinitions.get(cClassInlineMethodDefinitionKey(info, method))

      if (definition === null || typeof definition === 'undefined') {
        continue
      }

      pushAllLines(lines, definition)
    }
  }

  return lines
}

function cLinesReferenceIdentifier(lines: string[], identifier: string): boolean {
  for (const line of lines) {
    let start = 0

    while (start < line.length) {
      const found = line.indexOf(identifier, start)

      if (found === -1) {
        break
      }

      const before = found === 0 ? '' : line[found - 1]
      const afterIndex = found + identifier.length
      const after = afterIndex >= line.length ? '' : line[afterIndex]

      if (!isCIdentifierCharacter(before) && !isCIdentifierCharacter(after)) {
        return true
      }

      start = found + identifier.length
    }
  }

  return false
}

function isCIdentifierCharacter(value: string): boolean {
  if (value.length !== 1) {
    return false
  }

  return (
    (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') || (value >= '0' && value <= '9') || value === '_'
  )
}

function visitCNativeClassDefinition(
  info: CClassInfo,
  infos: CClassInfo[],
  context: CEmitContext,
  methodPrototypes: CClassMethodPrototypeMap,
  inlineConstructorDefinitions: CClassInlineDefinitionMap | null,
  inlineMethodDefinitions: CClassInlineDefinitionMap | null,
  visiting: Set<string>,
  visited: Set<string>,
  result: CClassInfo[]
): void {
  if (visited.has(info.name) || visiting.has(info.name)) {
    return
  }

  visiting.add(info.name)
  const dependencyLines = collectCNativeClassDefinitionDependencyLines(
    info,
    context,
    methodPrototypes,
    inlineConstructorDefinitions,
    inlineMethodDefinitions
  )

  for (const dependency of infos) {
    if (dependency.name === info.name) {
      continue
    }

    if (!cLinesReferenceIdentifier(dependencyLines, emitCClassInfoTypeName(dependency))) {
      continue
    }

    visitCNativeClassDefinition(
      dependency,
      infos,
      context,
      methodPrototypes,
      inlineConstructorDefinitions,
      inlineMethodDefinitions,
      visiting,
      visited,
      result
    )
  }

  visiting.delete(info.name)
  visited.add(info.name)
  result.push(info)
}

function pushIndentedCClassDefinition(lines: string[], definition: string[]): void {
  for (let index = 0; index < definition.length; index = index + 1) {
    const line = definition[index]
    lines.push(line.length === 0 ? '' : `  ${line}`)
  }
}

export function emitCClassDescriptorDeclarations(context: CEmitContext): string[] {
  return emitCClassDescriptorDeclarationsForNames(context, null)
}

export function emitCClassDescriptorDeclarationsForNames(
  context: CEmitContext,
  descriptorNames: CClassDescriptorNameSet | null
): string[] {
  const lines: string[] = []

  for (const info of context.classInfos.values()) {
    if (info.imported === true) {
      continue
    }

    if (descriptorNames !== null && !descriptorNames.has(info.name)) {
      continue
    }

    pushAllLines(lines, emitCClassDescriptorDeclaration(info, context))
  }

  return lines
}

function emitCClassDescriptorDeclaration(info: CClassInfo, context: CEmitContext): string[] {
  const typeName = emitCClassInfoTypeName(info)
  const lines: string[] = []

  if (!info.native) {
    return lines
  }

  if (info.fields.length > 0) {
    lines.push(`const inox_class_field_descriptor ${typeName}::inox_fields[] = {`)

    for (const field of info.fields) {
      lines.push(
        `  { ${cStringLiteral(field.name)}, ${emitCClassDescriptorString(field.valueType)}, ${emitCClassDescriptorString(
          classFieldDeclaredType(field)
        )}, ${emitCClassDescriptorString(classFieldOwnership(field))}, ${emitCClassDescriptorFieldFlags(field)} },`
      )
    }

    lines.push('};')
    lines.push('')
  }

  lines.push(
    `const inox_class_descriptor ${typeName}::inox_descriptor = inox::class_descriptor<${typeName}>(${cStringLiteral(info.name)});`
  )
  lines.push('')

  if (!cClassUsesInlineDefinitions(info)) {
    pushAllLines(lines, emitCClassDescriptorFieldReaderDeclaration(info, context, false))
    lines.push('')
  }

  return lines
}

function emitCClassDescriptorFieldReaderDeclaration(
  info: CClassInfo,
  context: CEmitContext,
  inClass: boolean
): string[] {
  const typeName = emitCClassInfoTypeName(info)
  const functionName = inClass ? 'inox_read_field' : `${typeName}::inox_read_field`
  const storage = inClass ? 'static ' : ''
  const lines = [`${storage}inox_status ${functionName}(const ${typeName}& value, uint32_t index, inox_value* out) {`]

  lines.push('  if (out == nullptr) {')
  lines.push('    return INOX_ERR_TYPE;')
  lines.push('  }')

  if (info.fields.length > 0) {
    lines.push('  switch (index) {')

    for (let index = 0; index < info.fields.length; index = index + 1) {
      const field = info.fields[index]
      lines.push(`    case ${index}:`)
      pushIndentedClassFieldReadLines(lines, emitCClassDescriptorFieldReadLines(field, context))
    }

    lines.push('  }')
  }

  lines.push('  return INOX_ERR_FIELD;')
  lines.push('}')

  return lines
}

function pushIndentedClassFieldReadLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(`      ${line}`)
  }
}

function emitCClassDescriptorFieldReadLines(field: CObjectShapeField, context: CEmitContext): string[] {
  const reference = `value.${emitCClassFieldName(field.name)}`

  if (field.valueType === 'number') {
    return [`*out = inox_number_value(${reference});`, 'return INOX_OK;']
  }

  if (field.valueType === 'boolean') {
    return [`*out = inox_bool_value(${reference});`, 'return INOX_OK;']
  }

  if (classFieldUsesRuntimeValueStorage(field)) {
    return [`return ${reference}.copy_to(out);`]
  }

  if (classFieldUsesCppStringStorage(field)) {
    return [`*out = ${reference}.raw();`, 'inox_retain(*out);', 'return INOX_OK;']
  }

  if (classFieldUsesNativeClassStorage(field)) {
    return [
      `return inox_class_instance_ref_copy(&inox_default_allocator, &${emitCClassDescriptorNameForClassName(context, field.className)}, &${reference}, out);`
    ]
  }

  const nativeRuntimeValueLines = emitCClassDescriptorNativeFieldReadLines(field, reference, context)

  if (nativeRuntimeValueLines !== null) {
    return nativeRuntimeValueLines
  }

  if (field.className !== null && typeof field.className !== 'undefined') {
    return [`*out = ${reference};`, 'inox_retain(*out);', 'return INOX_OK;']
  }

  return ['*out = inox_undefined_value();', 'return INOX_OK;']
}

function emitCClassDescriptorNativeFieldReadLines(
  field: CObjectShapeField,
  reference: string,
  context: CEmitContext
): string[] | null {
  if (classFieldLibraryNativeCppType(field) === null) {
    return null
  }

  const typeRef = cTypeRefValue(field.typeRef)

  if (typeRef === null || typeRef.kind !== 'nominal') {
    return null
  }

  const typeId = typeRef.typeId

  if (typeId === null || typeof typeId === 'undefined' || typeId === '') {
    return null
  }

  const expression = compilerLibraryNativeRuntimeValueExpressionForId(context.libraries, typeId)

  if (expression === null || typeof expression === 'undefined') {
    context.diagnostics.push(
      diagnostic(
        'INOX_C_CLASS',
        `native class field ${field.name} type ${typeId} requires a C++ runtime value expression`,
        field.loc
      )
    )
    return ['*out = inox_undefined_value();', 'return INOX_OK;']
  }

  const runtimeValue = expression.split('$value').join(reference)

  return [`*out = ${runtimeValue};`, 'inox_retain(*out);', 'return INOX_OK;']
}

function emitCClassDescriptorString(value: string | null): string {
  if (value === null) {
    return '0'
  }

  return cStringLiteral(value)
}

function emitCClassDescriptorFieldFlags(field: CObjectShapeField): string {
  const flags: string[] = []

  if (isReadonlyCObjectShapeField(field)) {
    flags.push('INOX_CLASS_FIELD_READONLY')
  }

  if (field.optional === true) {
    flags.push('INOX_CLASS_FIELD_OPTIONAL')
  }

  if (field.nullable === true) {
    flags.push('INOX_CLASS_FIELD_NULLABLE')
  }

  if (classFieldIsWeak(field)) {
    flags.push('INOX_CLASS_FIELD_WEAK')
  }

  flags.push('INOX_CLASS_FIELD_ENUMERABLE')

  return joinStrings(flags, ' | ')
}

function classHasNoArgConstructor(info: CClassInfo): boolean {
  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return false
  }

  const params: CFunctionParam[] = constructorMethod.params

  return params.length === 0
}

export function createClassInfos(
  classes: AnyNode[],
  diagnostics: Diagnostic[],
  symbolNames: Map<string, string> | null = null
): CClassInfoMap {
  const infos = createClassInfoMap()
  const classNodes: ClassExpressionNode[] = classes

  for (const item of classNodes) {
    const constructorMethod = findClassConstructorMethod(item)
    const assignments = collectClassConstructorAssignments(item, constructorMethod, diagnostics)
    const fields = resolveClassFields(item, constructorMethod, assignments)
    const methods = createClassMethodMap()
    const methodNodes: ClassExpressionNode[] = item.methods

    for (const method of methodNodes) {
      if (method.name !== 'constructor') {
        methods.set(method.name, method)
      }
    }

    infos.set(item.name, {
      name: item.name,
      symbolName: classSymbolName(item.name, symbolNames),
      node: item,
      constructor: constructorMethod,
      assignments,
      fields,
      methods,
      native: classCanUseNativeLowering(fields)
    })
  }

  markClassFieldOwnersRuntimeBacked(infos)
  annotateClassMethodParamClassNames(infos)

  return infos
}

export function collectCClassDescriptorNames(
  programs: IrProgram[],
  classInfos: CClassInfoMap
): CClassDescriptorNameSet {
  const names: CClassDescriptorNameSet = new Set()

  for (const program of programs) {
    const body = program.body

    if (Array.isArray(body)) {
      scanClassDescriptorStatements(body, classInfos, createClassDescriptorScanScope(null), names)
    }
  }

  return names
}

function createClassDescriptorScanScope(
  className: string | null,
  returnValueType: string | null = null
): ClassDescriptorScanScope {
  return {
    className,
    functions: new Map(),
    returnValueType,
    variables: new Map()
  }
}

function cloneClassDescriptorScanScope(scope: ClassDescriptorScanScope): ClassDescriptorScanScope {
  return {
    className: scope.className,
    functions: new Map(scope.functions),
    returnValueType: scope.returnValueType,
    variables: new Map(scope.variables)
  }
}

function scanClassDescriptorStatements(
  statements: AnyNode[],
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (!Array.isArray(statements)) {
    return
  }

  registerClassDescriptorFunctionDeclarations(statements, scope)

  for (const statement of statements) {
    scanClassDescriptorStatement(statement, classInfos, scope, names)
  }
}

function registerClassDescriptorFunctionDeclarations(statements: AnyNode[], scope: ClassDescriptorScanScope): void {
  for (const statement of statements) {
    if (statement.type !== 'FunctionDeclaration') {
      continue
    }

    const name = stringOrNull(statement.name)

    if (name === null || !Array.isArray(statement.params)) {
      continue
    }

    const params: CFunctionParam[] = statement.params
    scope.functions.set(name, params)
  }
}

function scanClassDescriptorStatement(
  statement: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (statement.type === 'ClassDeclaration') {
    scanClassDescriptorClassDeclaration(statement, classInfos, scope, names)
    return
  }

  if (statement.type === 'FunctionDeclaration') {
    scanClassDescriptorFunctionDeclaration(statement, classInfos, scope, names)
    return
  }

  if (statement.type === 'VariableDeclaration') {
    scanClassDescriptorVariableDeclaration(statement, classInfos, scope, names)
    return
  }

  if (statement.type === 'ThrowStatement') {
    addClassDescriptorExpressionName(statement.argument, classInfos, scope, names)
    scanClassDescriptorExpression(statement.argument, classInfos, scope, names)
    return
  }

  if (statement.type === 'ReturnStatement') {
    if (classDescriptorValueTypeRequiresRuntimeBoundary(scope.returnValueType)) {
      addClassDescriptorExpressionName(statement.argument, classInfos, scope, names)
    }

    scanClassDescriptorExpression(statement.argument, classInfos, scope, names)
    return
  }

  if (statement.type === 'ExpressionStatement') {
    scanClassDescriptorExpression(statement.expression, classInfos, scope, names)
    return
  }

  scanClassDescriptorNodeChildren(statement, classInfos, scope, names)
}

function scanClassDescriptorClassDeclaration(
  classNode: AnyNode,
  classInfos: CClassInfoMap,
  parentScope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const methods: AnyNode[] = classNode.methods

  if (!Array.isArray(methods)) {
    return
  }

  for (const method of methods) {
    const scope = createClassDescriptorScanScope(classNode.name, stringOrNull(method.returnType))
    scope.functions = new Map(parentScope.functions)
    registerClassDescriptorParams(method.params, scope)
    scanClassDescriptorStatements(classNodeArray(method.body), classInfos, scope, names)
  }
}

function scanClassDescriptorFunctionDeclaration(
  functionNode: AnyNode,
  classInfos: CClassInfoMap,
  parentScope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const scope = createClassDescriptorScanScope(null, stringOrNull(functionNode.returnType))

  scope.functions = new Map(parentScope.functions)
  registerClassDescriptorParams(functionNode.params, scope)
  scanClassDescriptorStatements(classNodeArray(functionNode.body), classInfos, scope, names)
}

function registerClassDescriptorParams(params: AnyNode[] | null | undefined, scope: ClassDescriptorScanScope): void {
  if (!Array.isArray(params)) {
    return
  }

  for (const param of params) {
    const className = stringOrNull(param.className)

    if (className !== null) {
      scope.variables.set(param.name, className)
    }
  }
}

function scanClassDescriptorVariableDeclaration(
  statement: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const initClassName = classDescriptorExpressionClassName(statement.init, classInfos, scope)

  if (initClassName !== null) {
    scope.variables.set(statement.name, initClassName)

    if (statement.declaredType === 'object') {
      addClassDescriptorName(initClassName, classInfos, names)
    }
  }

  scanClassDescriptorExpression(statement.init, classInfos, scope, names)
}

function scanClassDescriptorExpression(
  expression: AnyNode | null | undefined,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (expression === null || typeof expression === 'undefined') {
    return
  }

  if (expression.type === 'CallExpression' || expression.type === 'NewExpression') {
    scanClassDescriptorCallLikeExpression(expression, classInfos, scope, names)
  }

  if (expression.type === 'ObjectLiteral') {
    scanClassDescriptorObjectLiteralExpression(expression, classInfos, scope, names)
  }

  if (expression.type === 'ArrayLiteral') {
    scanClassDescriptorArrayLiteralExpression(expression, classInfos, scope, names)
  }

  if (expression.type === 'TemplateLiteral') {
    scanClassDescriptorTemplateLiteralExpression(expression, classInfos, scope, names)
  }

  scanClassDescriptorNodeChildren(expression, classInfos, scope, names)
}

function scanClassDescriptorTemplateLiteralExpression(
  expression: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const placeholders = collectTemplatePlaceholderExpressions(expression)

  for (const placeholder of placeholders) {
    scanClassDescriptorExpression(placeholder, classInfos, scope, names)
  }
}

function scanClassDescriptorObjectLiteralExpression(
  expression: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const properties: AnyNode[] = expression.properties

  if (!Array.isArray(properties)) {
    return
  }

  for (const property of properties) {
    addClassDescriptorExpressionName(property.value, classInfos, scope, names)
  }
}

function scanClassDescriptorArrayLiteralExpression(
  expression: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const elements: AnyNode[] = expression.elements

  if (!Array.isArray(elements)) {
    return
  }

  addClassDescriptorExpressionNames(elements, classInfos, scope, names)
}

function scanClassDescriptorCallLikeExpression(
  expression: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (isClassDescriptorVariadicFormatCall(expression)) {
    addClassDescriptorExpressionNames(expression.args, classInfos, scope, names)
  } else if (hasClassDescriptorRuntimeValueArguments(expression)) {
    addClassDescriptorExpressionNames(expression.args, classInfos, scope, names)
  } else if (isClassDescriptorAsyncResultValueCall(expression)) {
    addClassDescriptorExpressionName(firstClassDescriptorArgument(expression), classInfos, scope, names)
  }

  addClassDescriptorRuntimeParameterNames(expression, classInfos, scope, names)
}

function isClassDescriptorVariadicFormatCall(expression: AnyNode): boolean {
  const argumentKinds = expression.libraryCArgumentKinds

  return (
    expression.type === 'CallExpression' &&
    argumentKinds !== null &&
    typeof argumentKinds !== 'undefined' &&
    argumentKinds.length === 1 &&
    argumentKinds[0] === 'variadic-format-values'
  )
}

function hasClassDescriptorRuntimeValueArguments(expression: AnyNode): boolean {
  const argumentKinds = expression.libraryCArgumentKinds

  if (!Array.isArray(argumentKinds)) {
    return false
  }

  return argumentKinds.includes('runtime-value')
}

function isClassDescriptorAsyncResultValueCall(expression: AnyNode): boolean {
  const operation = expression.libraryAsyncResultOperation
  return expression.type === 'CallExpression' && (operation === 'fulfill' || operation === 'reject')
}

function addClassDescriptorRuntimeParameterNames(
  expression: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const params = classDescriptorCallParams(expression, classInfos, scope)

  if (params === null) {
    return
  }

  const args: AnyNode[] = expression.args

  for (let index = 0; index < params.length && index < args.length; index = index + 1) {
    if (!classDescriptorParamRequiresRuntimeBoundary(params[index])) {
      continue
    }

    addClassDescriptorExpressionName(args[index], classInfos, scope, names)
  }
}

function classDescriptorCallParams(
  expression: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope
): CFunctionParam[] | null {
  if (expression.type === 'NewExpression') {
    const className = classDescriptorNewExpressionClassName(expression, classInfos)

    if (className === null) {
      return null
    }

    const info = classInfos.get(className)

    if (info === null || typeof info === 'undefined') {
      return []
    }

    const constructorMethod = info.constructor

    if (constructorMethod === null || typeof constructorMethod === 'undefined') {
      return []
    }

    return constructorMethod.params
  }

  const callee = expression.callee

  if (
    expression.type === 'CallExpression' &&
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'Reference' &&
    Array.isArray(callee.path) &&
    callee.path.length === 1
  ) {
    const functionName = stringOrNull(callee.path[0])

    if (functionName === null) {
      return null
    }

    const params = scope.functions.get(functionName)

    if (params !== null && typeof params !== 'undefined') {
      return params
    }
  }

  if (
    expression.type === 'CallExpression' &&
    callee !== null &&
    typeof callee !== 'undefined' &&
    callee.type === 'MemberExpression'
  ) {
    const receiverClassName = classDescriptorExpressionClassName(callee.object, classInfos, scope)
    const methodName = stringOrNull(callee.property)

    if (receiverClassName === null || methodName === null) {
      return null
    }

    const info = classInfos.get(receiverClassName)

    if (info === null || typeof info === 'undefined') {
      return null
    }

    const method = info.methods.get(methodName)

    if (method === null || typeof method === 'undefined') {
      return null
    }

    return method.params
  }

  return null
}

function classDescriptorParamRequiresRuntimeBoundary(param: CFunctionParam): boolean {
  if (param.className !== null && typeof param.className !== 'undefined') {
    return true
  }

  return classDescriptorValueTypeRequiresRuntimeBoundary(param.valueType)
}

function classDescriptorValueTypeRequiresRuntimeBoundary(valueType: string | null | undefined): boolean {
  if (valueType === null || typeof valueType === 'undefined') {
    return false
  }

  return valueType === 'object' || valueType === 'unknown' || isManagedRuntimeReturnType(valueType)
}

function addClassDescriptorExpressionNames(
  expressions: AnyNode[] | null | undefined,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (!Array.isArray(expressions)) {
    return
  }

  for (const expression of expressions) {
    addClassDescriptorExpressionName(expression, classInfos, scope, names)
  }
}

function addClassDescriptorExpressionName(
  expression: AnyNode | null | undefined,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  const className = classDescriptorExpressionClassName(expression, classInfos, scope)

  if (className !== null) {
    addClassDescriptorName(className, classInfos, names)
  }
}

function addClassDescriptorName(className: string, classInfos: CClassInfoMap, names: CClassDescriptorNameSet): void {
  const info = classInfos.get(className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return
  }

  names.add(className)
}

function classDescriptorExpressionClassName(
  expression: AnyNode | null | undefined,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope
): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const directClassName = stringOrNull(expression.className)

  if (directClassName !== null) {
    return directClassName
  }

  if (expression.type === 'Reference' && Array.isArray(expression.path) && expression.path.length === 1) {
    const className = scope.variables.get(expression.path[0])

    if (className !== null && typeof className !== 'undefined') {
      return className
    }

    return null
  }

  if (expression.type === 'ThisExpression') {
    return scope.className
  }

  if (expression.type === 'NewExpression') {
    return classDescriptorNewExpressionClassName(expression, classInfos)
  }

  return null
}

function classDescriptorNewExpressionClassName(expression: AnyNode, classInfos: CClassInfoMap): string | null {
  const callee = expression.callee

  if (
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'Reference' ||
    !Array.isArray(callee.path) ||
    callee.path.length !== 1
  ) {
    return null
  }

  const className = stringOrNull(callee.path[0])

  if (className === null) {
    return null
  }

  if (classInfos.has(className)) {
    return className
  }

  return null
}

function firstClassDescriptorArgument(expression: AnyNode): AnyNode | null {
  const args: AnyNode[] = expression.args

  if (!Array.isArray(args) || args.length === 0) {
    return null
  }

  return args[0]
}

function scanClassDescriptorNodeChildren(
  node: AnyNode | null | undefined,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (node === null || typeof node === 'undefined') {
    return
  }

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'shape' || key === 'functionType') {
      continue
    }

    const value = node[key]

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isClassDescriptorNode(child)) {
          scanClassDescriptorNode(child as AnyNode, classInfos, cloneClassDescriptorScanScope(scope), names)
        }
      }
    } else if (isClassDescriptorNode(value)) {
      scanClassDescriptorNode(value as AnyNode, classInfos, cloneClassDescriptorScanScope(scope), names)
    }
  }
}

function scanClassDescriptorNode(
  node: AnyNode,
  classInfos: CClassInfoMap,
  scope: ClassDescriptorScanScope,
  names: CClassDescriptorNameSet
): void {
  if (isClassDescriptorStatementNode(node)) {
    scanClassDescriptorStatement(node, classInfos, scope, names)
  } else {
    scanClassDescriptorExpression(node, classInfos, scope, names)
  }
}

function isClassDescriptorNode(value: AnyNode | null | undefined): boolean {
  return value !== null && typeof value !== 'undefined' && typeof value === 'object' && typeof value.type === 'string'
}

function isClassDescriptorStatementNode(node: AnyNode): boolean {
  return (
    node.type === 'ClassDeclaration' ||
    node.type === 'ExpressionStatement' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'ReturnStatement' ||
    node.type === 'ThrowStatement' ||
    node.type === 'VariableDeclaration'
  )
}

function classSymbolName(name: string, symbolNames: Map<string, string> | null | undefined): string {
  if (symbolNames !== null && typeof symbolNames !== 'undefined') {
    const symbolName = symbolNames.get(name)

    if (symbolName !== null && typeof symbolName !== 'undefined') {
      return symbolName
    }
  }

  return name
}

function annotateClassMethodParamClassNames(infos: CClassInfoMap): void {
  for (const info of infos.values()) {
    const methods: ClassExpressionNode[] = info.node.methods

    for (const method of methods) {
      const params: ClassExpressionNode[] = method.params

      for (const param of params) {
        const className = classParamClassName(param, infos)

        if (className !== null && typeof className !== 'undefined') {
          param.className = className
        }
      }
    }
  }
}

function classParamClassName(param: ClassExpressionNode, infos: CClassInfoMap): string | null {
  for (const className of infos.keys()) {
    if (param.className === className || param.declaredType === className || param.valueType === className) {
      return className
    }
  }

  return null
}

function classFieldDeclaredType(field: CObjectShapeField): string | null {
  const declaredType = field.declaredType

  if (declaredType !== null && typeof declaredType !== 'undefined') {
    return declaredType
  }

  return null
}

function classFieldIsWeak(field: CObjectShapeField): boolean {
  if (field.ownership === 'weak') {
    return true
  }

  if (field.functionTypeOwnership === 'weak') {
    return true
  }

  return field.shapeOwnership === 'weak'
}

function markClassFieldOwnersRuntimeBacked(infos: CClassInfoMap): void {
  let changed = true

  while (changed) {
    changed = false

    for (const info of infos.values()) {
      if (!info.native) {
        continue
      }

      for (const field of info.fields) {
        const className = field.className

        if (className === null || typeof className === 'undefined') {
          continue
        }

        const target = infos.get(className)

        if (target === null || typeof target === 'undefined' || !target.native) {
          info.native = false
          changed = true
          break
        }
      }
    }
  }
}

function findClassConstructorMethod(classNode: AnyNode): AnyNode | null {
  const methods = classNodeArray(classNode.methods)

  for (const method of methods) {
    if (method.name === 'constructor') {
      return method
    }
  }

  return null
}

export function collectClassMethods(context: ClassEmitContext): CClassMethod[] {
  const methods: CClassMethod[] = []
  const classInfos = context.classInfos

  for (const info of classInfos.values()) {
    if (info.imported === true) {
      continue
    }

    const methodList = classNodeArray(info.node.methods)

    for (const method of methodList) {
      if (method.name === 'constructor') {
        continue
      }

      methods.push({
        info,
        method
      })
    }
  }

  return methods
}

function collectClassConstructorAssignments(
  classNode: AnyNode,
  constructorMethod: AnyNode | null,
  diagnostics: Diagnostic[]
): AnyNode[] {
  const assignments: AnyNode[] = []

  if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
    const statements = classNodeArray(constructorMethod.body)
    const localNames = createClassConstructorLocalNameSet()

    for (const statement of statements) {
      const assignment = classConstructorFieldAssignment(statement)

      if (assignment !== null && typeof assignment !== 'undefined') {
        assignments.push(createClassConstructorAssignment(assignment.field, assignment.assignment))
        continue
      }

      if (registerSupportedClassConstructorLocalStatement(statement, localNames)) {
        continue
      }

      if (isSupportedClassConstructorLocalAssignment(statement, localNames)) {
        continue
      }

      if (isSupportedClassConstructorThisMethodCall(statement)) {
        continue
      }

      if (isSupportedClassConstructorForStatement(statement, localNames)) {
        continue
      }

      if (isSupportedClassConstructorIfStatement(statement, localNames)) {
        continue
      }

      diagnostics.push(
        diagnostic(
          'INOX_C_CLASS',
          `class ${classNode.name} constructor currently supports only local declarations, local assignments, if/for statements, this method calls and this.field assignments in the C++ backend`,
          nodeLocOrFallback(statement, constructorMethod)
        )
      )
    }
  }

  return assignments
}

type ClassConstructorLocalNameSet = Set<string>

type ClassConstructorFieldAssignment = {
  assignment: AnyNode
  field: string
}

function createClassConstructorLocalNameSet(): ClassConstructorLocalNameSet {
  return new Set()
}

function copyClassConstructorLocalNameSet(source: ClassConstructorLocalNameSet): ClassConstructorLocalNameSet {
  return new Set(source)
}

function classConstructorFieldAssignment(statement: AnyNode): ClassConstructorFieldAssignment | null {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') {
    return null
  }

  const field = thisFieldName(statement.expression.target)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  return {
    assignment: statement.expression,
    field
  }
}

function registerSupportedClassConstructorLocalStatement(
  statement: AnyNode,
  localNames: ClassConstructorLocalNameSet
): boolean {
  if (statement.type !== 'VariableDeclaration') {
    return false
  }

  if (typeof statement.name === 'string' && statement.name !== '') {
    localNames.add(statement.name)
  }

  return true
}

function isSupportedClassConstructorLocalAssignment(
  statement: AnyNode,
  localNames: ClassConstructorLocalNameSet
): boolean {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'AssignmentExpression') {
    return false
  }

  const target = statement.expression.target

  if (target.type !== 'Reference' || target.path.length !== 1) {
    return false
  }

  return localNames.has(target.path[0])
}

function isSupportedClassConstructorThisMethodCall(statement: AnyNode): boolean {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') {
    return false
  }

  const callee = statement.expression.callee

  if (callee.type !== 'MemberExpression') {
    return false
  }

  return isThisRootedExpression(callee.object)
}

function isThisRootedExpression(expression: AnyNode): boolean {
  if (isThisObjectExpression(expression)) {
    return true
  }

  if (expression.type === 'MemberExpression') {
    return isThisRootedExpression(expression.object)
  }

  return false
}

function isSupportedClassConstructorIfStatement(statement: AnyNode, localNames: ClassConstructorLocalNameSet): boolean {
  if (statement.type !== 'IfStatement') {
    return false
  }

  const consequent = classNodeOrNull(statement.consequent)
  const alternate = classNodeOrNull(statement.alternate)

  if (consequent === null || !isSupportedClassConstructorBranch(consequent, localNames)) {
    return false
  }

  if (alternate === null) {
    return true
  }

  return isSupportedClassConstructorBranch(alternate, localNames)
}

function isSupportedClassConstructorBranch(statement: AnyNode, localNames: ClassConstructorLocalNameSet): boolean {
  const branchLocalNames = copyClassConstructorLocalNameSet(localNames)

  if (statement.type === 'BlockStatement') {
    const body = classNodeArray(statement.body)

    for (const item of body) {
      if (!isSupportedClassConstructorStatement(item, branchLocalNames)) {
        return false
      }
    }

    return true
  }

  return isSupportedClassConstructorStatement(statement, branchLocalNames)
}

function isSupportedClassConstructorStatement(statement: AnyNode, localNames: ClassConstructorLocalNameSet): boolean {
  const assignment = classConstructorFieldAssignment(statement)

  if (assignment !== null && typeof assignment !== 'undefined') {
    return true
  }

  if (registerSupportedClassConstructorLocalStatement(statement, localNames)) {
    return true
  }

  if (isSupportedClassConstructorLocalAssignment(statement, localNames)) {
    return true
  }

  if (isSupportedClassConstructorThisMethodCall(statement)) {
    return true
  }

  if (isSupportedClassConstructorForStatement(statement, localNames)) {
    return true
  }

  return isSupportedClassConstructorIfStatement(statement, localNames)
}

function isSupportedClassConstructorForStatement(
  statement: AnyNode,
  localNames: ClassConstructorLocalNameSet
): boolean {
  if (statement.type !== 'ForStatement') {
    return false
  }

  const loopLocalNames = copyClassConstructorLocalNameSet(localNames)
  const init = classNodeOrNull(statement.init)
  const body = classNodeOrNull(statement.body)

  if (
    init !== null &&
    typeof init !== 'undefined' &&
    !registerSupportedClassConstructorLocalStatement(init, loopLocalNames) &&
    !isSupportedClassConstructorLocalAssignment(init, loopLocalNames)
  ) {
    return false
  }

  return body !== null && isSupportedClassConstructorBranch(body, loopLocalNames)
}

function createClassConstructorAssignment(field: string, assignment: AnyNode): AnyNode {
  return {
    field,
    value: assignment.value,
    loc: assignment.loc
  }
}

function resolveClassFields(
  classNode: AnyNode,
  constructorMethod: AnyNode | null,
  assignments: AnyNode[]
): CObjectShapeField[] {
  let shapeFields: CObjectShapeField[] | null = null

  if (
    classNode.shape !== null &&
    typeof classNode.shape !== 'undefined' &&
    classNode.shape.fields !== null &&
    typeof classNode.shape.fields !== 'undefined'
  ) {
    shapeFields = classNode.shape.fields
  }

  if (shapeFields !== null && typeof shapeFields !== 'undefined') {
    const fields: CObjectShapeField[] = []

    for (const field of shapeFields) {
      fields.push(resolveClassShapeField(field))
    }

    return fields
  }

  const fields: CObjectShapeField[] = []
  const seen = createStringSet()

  for (const assignment of assignments) {
    if (seen.has(assignment.field)) {
      continue
    }

    seen.add(assignment.field)
    const valueType = inferClassConstructorFieldType(assignment.value, constructorMethod)
    fields.push({
      name: assignment.field,
      readonlyField: false,
      ownership: 'strong',
      valueType
    })
  }

  return fields
}

function resolveClassShapeField(field: CObjectShapeField): CObjectShapeField {
  let ownership = 'strong'
  const valueType = field.valueType
  const fieldOwnership = field.ownership

  if (fieldOwnership !== null && typeof fieldOwnership !== 'undefined') {
    ownership = fieldOwnership
  }

  return {
    name: field.name,
    readonlyField: isReadonlyCObjectShapeField(field),
    ownership,
    valueType,
    className: field.className,
    declaredType: field.declaredType,
    shape: field.shape,
    typeRef: field.typeRef,
    functionType: field.functionType,
    nullable: field.nullable
  }
}

function inferClassConstructorFieldType(expression: ClassMaybeNode, constructorMethod: AnyNode | null): string {
  if (expression === null || typeof expression === 'undefined') {
    return 'unknown'
  }

  if (
    expression.type === 'Reference' &&
    expression.path.length === 1 &&
    constructorMethod !== null &&
    typeof constructorMethod !== 'undefined'
  ) {
    const paramName = expression.path[0]
    const param = findClassParam(constructorMethod.params, paramName)

    if (param !== null && typeof param !== 'undefined') {
      if (param.valueType !== null && typeof param.valueType !== 'undefined') {
        return param.valueType
      }

      return 'unknown'
    }
  }

  if (expression.valueType !== null && typeof expression.valueType !== 'undefined') {
    return expression.valueType
  }

  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return 'string'
  }

  if (expression.type === 'NumberLiteral') {
    return 'number'
  }

  if (expression.type === 'BooleanLiteral') {
    return 'boolean'
  }

  if (expression.type === 'ObjectLiteral') {
    return 'object'
  }

  if (expression.type === 'ArrayLiteral') {
    return expression.valueType ?? 'unknown'
  }

  return 'unknown'
}

function findClassParam(params: AnyNode[], name: string): AnyNode | null {
  const source: ClassExpressionNode[] = params

  for (const param of source) {
    if (param.name === name) {
      return param
    }
  }

  return null
}

function thisFieldName(expression: ClassMaybeNode): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'MemberExpression') {
    return null
  }

  if (isThisObjectExpression(expression.object)) {
    return expression.property
  }

  return null
}

function isThisObjectExpression(expression: ClassMaybeNode): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'ThisExpression') {
    return true
  }

  return expression.type === 'Reference' && expression.path.length === 1 && expression.path[0] === 'this'
}

function nodeLocOrFallback(node: ClassMaybeNode, fallback: ClassMaybeNode): SourceLocation | null {
  if (node !== null && typeof node !== 'undefined' && node.loc !== null && typeof node.loc !== 'undefined') {
    return node.loc
  }

  if (fallback !== null && typeof fallback !== 'undefined') {
    return fallback.loc
  }

  return null
}

export function emitClassObjectVariableDeclaration(statement: AnyNode, context: ClassFunctionContext): string[] {
  const init = classNodeOrNull(statement.init)
  const info = resolveClassConstructorInfo(init, context)

  if (info !== null && typeof info !== 'undefined' && init !== null) {
    return emitSupportedClassObjectVariableDeclaration(statement, init, info, context)
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_CLASS',
      'this class constructor is not supported by the current C++ backend slice',
      nodeLocOrFallback(init, statement)
    )
  )

  return [`inox_value ${statement.name} = inox_undefined_value();`]
}

function emitSupportedClassObjectVariableDeclaration(
  statement: AnyNode,
  init: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  if (!info.native) {
    registerOwnedValue(context, statement.name)
    context.variables.set(statement.name, 'object')
    registerClassInstanceType(context, statement.name, info.name)
    registerClassObjectShape(context, statement.name, info)

    return emitCClassRuntimeObjectInitLines(statement.name, init, info, context)
  }

  context.variables.set(statement.name, classValueType(info))
  registerClassInstanceType(context, statement.name, info.name)
  return emitCNativeClassVariableDeclaration(statement.name, init, info, context)
}

function registerClassInstanceType(context: ClassFunctionContext, name: string, className: string): void {
  const classInstanceTypes = context.classInstanceTypes

  if (classInstanceTypes !== null && typeof classInstanceTypes !== 'undefined') {
    classInstanceTypes.set(name, className)
  }
}

export function emitCClassObjectValueExpression(
  expression: AnyNode,
  context: ClassFunctionContext
): PreparedExpression {
  const info = resolveClassConstructorInfo(expression, context)

  if (info !== null && typeof info !== 'undefined') {
    if (!info.native) {
      const temp = nextCName(context, 'inox_class_object')
      registerOwnedValue(context, temp)

      return {
        lines: emitCClassRuntimeObjectInitLines(temp, expression, info, context),
        expression: temp,
        valueType: 'object'
      }
    }

    const temp = nextCName(context, `inox_class_${info.name}`)
    return {
      lines: emitCNativeClassVariableDeclaration(temp, expression, info, context),
      expression: temp,
      valueType: classValueType(info)
    }
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_CLASS',
      'this class constructor is not supported by the current C++ backend slice',
      nodeLocOrFallback(expression, null)
    )
  )

  return {
    lines: [],
    expression: '0'
  }
}

function emitCClassRuntimeObjectInitLines(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  const shapeName = nextCName(context, `inox_shape_${info.name}`)
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  for (const field of info.fields) {
    lines.push(`  { ${cStringLiteral(field.name)}, ${emitClassFieldFlags(context, field)} },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${info.fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')
  lines.push(emitStatusCheck(`inox_object_new(&inox_default_allocator, &${shapeName}, ${target}.out())`, context))

  const constructorArgs = mapClassConstructorArgs(expression, info)

  for (const assignment of info.assignments) {
    const fieldIndex = findClassFieldIndex(info.fields, assignment.field)

    if (fieldIndex === -1) {
      context.diagnostics.push(
        diagnostic(
          'INOX_UNKNOWN_FIELD',
          `unknown class field ${assignment.field}`,
          nodeLocOrFallback(assignment, expression)
        )
      )
      continue
    }

    const valueExpression = substituteClassConstructorParams(assignment.value, constructorArgs, target)
    const field = info.fields[fieldIndex]

    if (field === null || typeof field === 'undefined') {
      continue
    }

    let value = isRuntimeFunctionType(field.functionType)
      ? emitClassRuntimeCallbackValue(context, valueExpression, field.functionType)
      : emitClassValueExpression(context, valueExpression)
    const classInstance = emitPreparedClassInstanceRefValueExpression(value, context)

    if (classInstance !== null && typeof classInstance !== 'undefined') {
      const wrappedValueLines: string[] = []

      pushAllLines(wrappedValueLines, value.lines)
      pushAllLines(wrappedValueLines, classInstance.lines)
      value = {
        lines: wrappedValueLines,
        expression: classInstance.expression,
        valueType: classInstance.valueType
      }
    }

    pushAllLines(lines, value.lines)
    lines.push(emitStatusCheck(`inox_object_init_known(${target}, ${fieldIndex}, ${value.expression})`, context))
  }

  return lines
}

export function registerClassObjectShape(context: ClassFunctionContext, name: string, info: CClassInfo): void {
  const fields: CObjectShapeField[] = []

  for (const field of info.fields) {
    fields.push({
      name: field.name,
      ownership: classFieldOwnership(field),
      readonlyField: isReadonlyCObjectShapeField(field),
      valueType: field.valueType,
      className: field.className,
      declaredType: field.declaredType,
      shape: field.shape,
      typeRef: field.typeRef,
      functionType: field.functionType,
      nullable: field.nullable
    })
  }

  context.objectShapes.set(name, fields)
}

function findClassFieldIndex(fields: CObjectShapeField[], name: string): number {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === name) {
      return index
    }
  }

  return -1
}

function mapClassConstructorArgs(expression: AnyNode, info: CClassInfo): CConstructorArgMap {
  const args = createConstructorArgMap()
  const params = classConstructorParams(info)

  for (let index = 0; index < params.length && index < expression.args.length; index = index + 1) {
    const param = params[index]
    const arg = expression.args[index]

    if (arg !== null && typeof arg !== 'undefined') {
      args.set(param.name, arg)
    }
  }

  return args
}

function substituteClassConstructorParams(node: ClassMaybeNode, args: CConstructorArgMap, target: string): AnyNode {
  if (node === null || typeof node === 'undefined') {
    return {
      type: 'InvalidExpression'
    }
  }

  if (node.type === 'ThisExpression') {
    return {
      type: 'Reference',
      path: [target],
      valueType: node.valueType,
      shape: node.shape,
      className: node.className,
      loc: node.loc
    }
  }

  if (node.type === 'Reference' && node.path.length === 1 && args.has(node.path[0])) {
    const name = node.path[0]
    const replacement = args.get(name)

    if (replacement !== null && typeof replacement !== 'undefined') {
      return replacement
    }
  }

  if (node.type === 'ArrayLiteral') {
    return substituteArrayLiteral(node, args, target)
  }

  if (node.type === 'ObjectLiteral') {
    return substituteObjectLiteral(node, args, target)
  }

  if (node.type === 'MemberExpression') {
    return {
      type: node.type,
      object: substituteClassConstructorParams(node.object, args, target),
      property: node.property,
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'IndexExpression') {
    return {
      type: node.type,
      object: substituteClassConstructorParams(node.object, args, target),
      index: substituteClassConstructorParams(node.index, args, target),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    return substituteCallLikeExpression(node, args, target)
  }

  if (node.type === 'BinaryExpression') {
    return {
      type: node.type,
      operator: node.operator,
      left: substituteClassConstructorParams(node.left, args, target),
      right: substituteClassConstructorParams(node.right, args, target),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'UnaryExpression') {
    return {
      type: node.type,
      operator: node.operator,
      argument: substituteClassConstructorParams(node.argument, args, target),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  if (node.type === 'TypeAssertionExpression') {
    return {
      type: node.type,
      expression: substituteClassConstructorParams(node.expression, args, target),
      valueType: node.valueType,
      loc: node.loc
    }
  }

  return node
}

function substituteArrayLiteral(node: AnyNode, args: CConstructorArgMap, target: string): AnyNode {
  const elements: AnyNode[] = []
  const sourceElements: ClassExpressionNode[] = node.elements

  for (const element of sourceElements) {
    elements.push(substituteClassConstructorParams(element, args, target))
  }

  return {
    type: node.type,
    elements,
    valueType: node.valueType,
    loc: node.loc
  }
}

function substituteObjectLiteral(node: AnyNode, args: CConstructorArgMap, target: string): AnyNode {
  const properties: AnyNode[] = []
  const sourceProperties: ClassExpressionNode[] = node.properties

  for (const property of sourceProperties) {
    properties.push({
      key: property.key,
      value: substituteClassConstructorParams(property.value, args, target),
      loc: property.loc
    })
  }

  return {
    type: node.type,
    properties,
    valueType: node.valueType,
    shape: node.shape,
    loc: node.loc
  }
}

function substituteCallLikeExpression(node: AnyNode, args: CConstructorArgMap, target: string): AnyNode {
  const callArgs: AnyNode[] = []
  const sourceArgs: ClassExpressionNode[] = node.args

  for (const arg of sourceArgs) {
    callArgs.push(substituteClassConstructorParams(arg, args, target))
  }

  return {
    ...node,
    callee: substituteClassConstructorParams(node.callee, args, target),
    args: callArgs
  }
}

export function emitCNativeClassAssignmentLines(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  const prepared = emitPreparedNativeClassConstructorArgs(context, expression, info)
  const lines: string[] = []

  pushAllLines(lines, prepared.lines)
  lines.push(`${target} = ${emitCClassInfoTypeName(info)}(${joinStrings(prepared.args, ', ')});`)

  return lines
}

function emitCNativeClassVariableDeclaration(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  const prepared = emitPreparedNativeClassConstructorArgs(context, expression, info)
  const lines: string[] = []

  pushAllLines(lines, prepared.lines)

  if (prepared.args.length === 0) {
    lines.push(`${emitCClassInfoTypeName(info)} ${emitCIdentifier(target)};`)
  } else {
    lines.push(`${emitCClassInfoTypeName(info)} ${emitCIdentifier(target)}{${joinStrings(prepared.args, ', ')}};`)
  }

  return lines
}

function emitPreparedNativeClassConstructorArgs(
  context: ClassFunctionContext,
  expression: AnyNode,
  info: CClassInfo
): PreparedCallArgs {
  const params = classConstructorParams(info)

  if (canUseCppValueConstructorArgFastPath(params, expression)) {
    return emitPreparedCppValueConstructorArgs(context, expression, params)
  }

  const prepared = emitPreparedClassCallArgs(context, expression, params)
  const args: string[] = []

  for (let index = 0; index < prepared.args.length; index = index + 1) {
    const arg = prepared.args[index]
    const param = index < params.length ? params[index] : null

    if (param !== null && classParamUsesCppStringStorage(param)) {
      args.push('inox::String(inox::Value(' + arg + '))')
    } else if (param !== null && classParamUsesCppValueStorage(param)) {
      args.push('inox::Value(' + arg + ')')
    } else {
      args.push(arg)
    }
  }

  return {
    lines: prepared.lines,
    args
  }
}

function canUseCppValueConstructorArgFastPath(params: CFunctionParam[], expression: AnyNode): boolean {
  if (params.length === 0 || params.length !== expression.args.length) {
    return false
  }

  for (const param of params) {
    if (
      (!classParamUsesCppValueStorage(param) && !classParamUsesCppStringStorage(param)) ||
      classParamNeedsGenericConstructorArgLowering(param)
    ) {
      return false
    }
  }

  for (const arg of expression.args) {
    if (arg.type !== 'StringLiteral') {
      return false
    }
  }

  return true
}

function emitPreparedCppValueConstructorArgs(
  context: ClassFunctionContext,
  expression: AnyNode,
  params: CFunctionParam[]
): PreparedCallArgs {
  const lines: string[] = []
  const args: string[] = []

  for (let index = 0; index < params.length && index < expression.args.length; index = index + 1) {
    const param = params[index]
    const arg = expression.args[index]

    if (param.valueType === 'string' && arg.type === 'StringLiteral') {
      args.push(`inox::String(${cStringLiteral(arg.value)}, ${utf8ByteLength(arg.value)})`)
      continue
    }

    const value = emitClassValueExpression(context, arg)

    pushAllLines(lines, value.lines)
    if (classParamUsesCppStringStorage(param)) {
      args.push(`inox::String(inox::Value(${value.expression}))`)
    } else {
      args.push(`inox::Value(${value.expression})`)
    }
  }

  return {
    lines,
    args
  }
}

function classFieldForName(info: CClassInfo, name: string): CObjectShapeField | null {
  for (const field of info.fields) {
    if (field.name === name) {
      return field
    }
  }

  return null
}

function classMethodAcceptsArgumentCount(params: CFunctionParam[], count: number): boolean {
  return count >= requiredClassMethodParamCount(params) && count <= params.length
}

function classMethodArgumentCountMessage(method: string, params: CFunctionParam[], count: number): string {
  const min = requiredClassMethodParamCount(params)
  const max = params.length
  let expected = `${max}`

  if (min !== max) {
    expected = `${min}-${max}`
  }

  return `method ${method} expects ${expected} argument(s), got ${count}`
}

function requiredClassMethodParamCount(params: CFunctionParam[]): number {
  let count = 0

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    if (param.optional !== true && (param.defaultValue === null || typeof param.defaultValue === 'undefined')) {
      count = count + 1
    }
  }

  return count
}

function classConstructorParams(info: CClassInfo): CFunctionParam[] {
  const constructorMethod = info.constructor

  if (constructorMethod !== null && typeof constructorMethod !== 'undefined') {
    return constructorMethod.params
  }

  return []
}

function resolveClassConstructorInfo(expression: ClassMaybeNode, context: ClassFunctionContext): CClassInfo | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'NewExpression') {
    return null
  }

  if (expression.callee.type !== 'Reference' || expression.callee.path.length !== 1) {
    return null
  }

  const classInfos = context.classInfos

  if (classInfos === null || typeof classInfos === 'undefined') {
    return null
  }

  const path: string[] = expression.callee.path
  const className = path[0]

  if (className === null || typeof className === 'undefined') {
    return null
  }

  const info = classInfos.get(className)

  if (info !== null && typeof info !== 'undefined') {
    return info
  }

  return null
}

export function isClassConstructorExpression(expression: AnyNode, context: ClassFunctionContext): boolean {
  return !!resolveClassConstructorInfo(expression, context)
}

export function emitPreparedClassMethodCallExpression(
  expression: AnyNode,
  context: ClassFunctionContext,
  options: PreparedCallOptions = {}
): PreparedExpression | null {
  const call = resolveClassMethodCallInfo(expression, context)

  if (call !== null && typeof call !== 'undefined') {
    return emitPreparedResolvedClassMethodCallExpression(expression, context, call, options)
  }

  return null
}

function emitPreparedResolvedClassMethodCallExpression(
  expression: AnyNode,
  context: ClassFunctionContext,
  call: ClassMethodCallInfo,
  options: PreparedCallOptions
): PreparedExpression | null {
  const method = resolveClassMethod(call.info, call.methodName)

  if (method !== null && typeof method !== 'undefined') {
    return emitKnownPreparedClassMethodCallExpression(expression, context, call, method, options)
  }

  if (isClassFunctionField(call.info, call.methodName)) {
    return null
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_UNKNOWN_FIELD',
      `unknown method ${call.methodName}`,
      nodeLocOrFallback(expression.callee, expression)
    )
  )

  return {
    lines: [],
    expression: ''
  }
}

function isClassFunctionField(info: CClassInfo, name: string): boolean {
  for (const field of info.fields) {
    if (
      field.name === name &&
      field.valueType === 'function' &&
      field.functionType !== null &&
      typeof field.functionType !== 'undefined'
    ) {
      return true
    }
  }

  return false
}

function emitKnownPreparedClassMethodCallExpression(
  expression: AnyNode,
  context: ClassFunctionContext,
  call: ClassMethodCallInfo,
  method: AnyNode,
  options: PreparedCallOptions
): PreparedExpression {
  if (!classMethodAcceptsArgumentCount(method.params, expression.args.length)) {
    context.diagnostics.push(
      diagnostic(
        'INOX_ARG_COUNT',
        classMethodArgumentCountMessage(expression.callee.property, method.params, expression.args.length),
        expression.loc
      )
    )
  }

  const prepared = emitPreparedClassCallArgs(context, expression, method.params)
  const callLines: string[] = []

  pushAllLines(callLines, call.objectLines)
  pushAllLines(callLines, prepared.lines)

  const callExpression = emitClassMethodCallExpression(call, method, prepared, context)
  const leavesPendingException = isPendingExceptionClassMethod(call.info, method, context)
  const returnCppType = libraryNativeBoundaryCppType(
    method.returnType,
    method.returnNullable === true,
    false,
    method.returnShape
  )

  if (method.returnType === 'async-result') {
    let out = callExpression
    let asyncResultValueType = 'unknown'
    const methodAsyncResultValueType = method.returnAsyncResultValueType

    if (methodAsyncResultValueType !== null && typeof methodAsyncResultValueType !== 'undefined') {
      asyncResultValueType = methodAsyncResultValueType
    }

    if (options.out !== null && typeof options.out !== 'undefined') {
      out = options.out
    } else if (leavesPendingException) {
      out = nextCName(context, 'inox_async_result')
    }

    registerOwnedAsyncResult(context, out, asyncResultValueType, 'unknown')

    if (out === callExpression) {
      return {
        lines: callLines,
        expression: out,
        valueType: 'async-result',
        rejectionValueType: 'unknown'
      }
    }

    const lines: string[] = []
    pushAllLines(lines, callLines)
    lines.push(`${out} = ${callExpression};`)
    if (leavesPendingException) {
      pushAllLines(lines, emitClassPendingExceptionCheck(context))
    }

    return {
      lines,
      expression: out,
      valueType: 'async-result',
      rejectionValueType: 'unknown'
    }
  }

  if (method.returnType === 'object' && returnCppType !== null) {
    if (leavesPendingException) {
      const result = nextCName(context, 'inox_method_result')
      const lines: string[] = []
      pushAllLines(lines, callLines)
      lines.push(`auto ${result} = ${callExpression};`)
      pushAllLines(lines, emitClassPendingExceptionCheck(context))

      return {
        lines,
        expression: result,
        cppType: returnCppType,
        valueType: 'object'
      }
    }

    return {
      lines: callLines,
      expression: callExpression,
      cppType: returnCppType,
      valueType: 'object'
    }
  }

  if (isManagedRuntimeReturnType(method.returnType) || Array.isArray(method.returnRuntimeTypeAlternatives)) {
    const value = nextCName(context, 'inox_method_value')
    const tag = cRuntimeValueTag(method.returnType)
    registerOwnedValue(context, value)
    const lines: string[] = []
    pushAllLines(lines, callLines)
    lines.push(`${value} = ${callExpression};`)
    if (leavesPendingException) {
      pushAllLines(lines, emitClassPendingExceptionCheck(context))
    }

    const alternativeValidExpressions = runtimeTypeAlternativeValidExpressions(
      method.returnRuntimeTypeAlternatives,
      value,
      context.libraries
    )

    if (alternativeValidExpressions !== null && alternativeValidExpressions.length > 0) {
      const valid = alternativeValidExpressions.join(' || ')
      const nullable =
        method.returnNullable === true || runtimeTypeAlternativesAreNullable(method.returnRuntimeTypeAlternatives)
      const mismatch =
        nullable
          ? `${value}.tag != INOX_TAG_UNDEFINED && ${value}.tag != INOX_TAG_NULL && !(${valid})`
          : `!(${valid})`

      lines.push(emitRuntimeTypeCheck(mismatch, context))
    } else if (alternativeValidExpressions === null && method.returnNullable === true) {
      pushAllLines(lines, emitRuntimeNullableValueCheck(value, tag, context))
    } else if (alternativeValidExpressions === null) {
      lines.push(emitRuntimeValueCheck(value, tag, context))
    }

    return {
      lines,
      expression: value
    }
  }

  let expressionText = callExpression

  if (leavesPendingException) {
    const lines: string[] = []
    pushAllLines(lines, callLines)

    if (method.returnType === 'void') {
      lines.push(`${callExpression};`)
      expressionText = ''
    } else {
      expressionText = nextCName(context, 'inox_method_result')
      lines.push(`auto ${expressionText} = ${callExpression};`)
    }

    pushAllLines(lines, emitClassPendingExceptionCheck(context))

    return {
      lines,
      expression: expressionText
    }
  }

  return {
    lines: callLines,
    expression: expressionText
  }
}

function emitClassPendingExceptionCheck(context: ClassFunctionContext): string[] {
  const target = currentClassErrorTarget(context)

  if (target !== null) {
    return [`if (inox::thrown()) goto ${target};`]
  }

  return [`if (inox::thrown()) ${emitFailureStatement(context)}`]
}

function currentClassErrorTarget(context: ClassFunctionContext): string | null {
  const targets = context.errorTargets

  if (targets === null || typeof targets === 'undefined' || targets.length === 0) {
    return null
  }

  return targets[targets.length - 1]
}

function isPendingExceptionClassMethod(
  info: CClassInfo,
  method: AnyNode,
  context: ClassFunctionContext
): boolean {
  return context.pendingExceptionFunctions.has(irClassMethodEffectName(info.name, method.name))
}

function emitClassMethodCallExpression(
  call: ClassMethodCallInfo,
  method: AnyNode,
  prepared: PreparedCallArgs,
  context: ClassFunctionContext
): string {
  const args: string[] = []

  if (classMethodTakesEventLoopParam(call.info, method, context)) {
    registerEventLoop(context)
  }

  for (const arg of prepared.args) {
    args.push(arg)
  }

  if (!call.native) {
    args.unshift(call.objectExpression)
    return `${emitCClassInfoMethodName(call.info, method.name)}(${joinStrings(args, ', ')})`
  }

  return `${call.objectExpression}${call.accessOperator}${emitCClassMethodIdentifier(method.name)}(${joinStrings(args, ', ')})`
}

function classMethodTakesEventLoopParam(info: CClassInfo, method: AnyNode, context: ClassFunctionContext): boolean {
  return functionTakesEventLoopParam(irClassMethodEffectName(info.name, method.name), context)
}

function resolveClassMethodCallInfo(
  expression: ClassMaybeNode,
  context: ClassFunctionContext
): ClassMethodCallInfo | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression'
  ) {
    return null
  }

  const objectName = resolveCObjectExpressionName(expression.callee.object)

  if (objectName) {
    const className = classNameForObject(context, objectName)

    if (
      className !== null &&
      typeof className !== 'undefined' &&
      !isNativeClassObjectName(context, objectName, className)
    ) {
      const info = classInfoForName(context, className)

      if (info !== null && typeof info !== 'undefined') {
        return {
          accessOperator: '.',
          info,
          methodName: expression.callee.property,
          native: false,
          objectExpression: emitObjectValueReference(objectName, context),
          objectLines: []
        }
      }
    }
  }

  const receiver = resolveNativeClassReceiverExpression(expression.callee.object, context)

  if (receiver !== null && typeof receiver !== 'undefined') {
    const info = classInfoForName(context, receiver.className)

    if (info !== null && typeof info !== 'undefined' && info.native) {
      return {
        accessOperator: receiver.accessOperator,
        info,
        methodName: expression.callee.property,
        native: true,
        objectExpression: receiver.expression,
        objectLines: receiver.lines
      }
    }
  }

  const receiverClassName = expression.callee.object.className

  if (receiverClassName !== null && typeof receiverClassName !== 'undefined') {
    const info = classInfoForName(context, receiverClassName)

    if (info !== null && typeof info !== 'undefined') {
      const object = emitClassValueExpression(context, expression.callee.object)

      if (info.native && object.valueType === classValueType(info)) {
        return {
          accessOperator: '.',
          info,
          methodName: expression.callee.property,
          native: true,
          objectExpression: object.expression,
          objectLines: object.lines
        }
      }

      if (info.native) {
        const nativeReceiver = emitRuntimeClassInstanceRefReceiver(object, info, context)

        if (nativeReceiver !== null && typeof nativeReceiver !== 'undefined') {
          return {
            accessOperator: nativeReceiver.accessOperator,
            info,
            methodName: expression.callee.property,
            native: true,
            objectExpression: nativeReceiver.expression,
            objectLines: nativeReceiver.lines
          }
        }
      }

      return {
        accessOperator: '.',
        info,
        methodName: expression.callee.property,
        native: false,
        objectExpression: object.expression,
        objectLines: object.lines
      }
    }
  }

  return null
}

function emitRuntimeClassInstanceRefReceiver(
  value: PreparedExpression,
  info: CClassInfo,
  context: ClassFunctionContext
): CNativeClassReceiver | null {
  if (value.expression === '') {
    return null
  }

  const ref = nextCName(context, 'inox_class_instance_ref')
  const receiver = nextCName(context, `inox_${info.name}_receiver`)
  const typeName = emitCClassInfoTypeName(info)
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  lines.push(
    `if (${value.expression}.tag != INOX_TAG_CLASS_INSTANCE || ${value.expression}.as.ref == 0) ${emitFailureStatement(
      context
    )}`
  )
  lines.push(`inox_class_instance_ref* ${ref} = (inox_class_instance_ref*)${value.expression}.as.ref;`)
  lines.push(
    `if (${ref}->descriptor != &${emitCClassInfoDescriptorName(info)} || ${ref}->instance == 0) ${emitFailureStatement(
      context
    )}`
  )
  lines.push(`${typeName}* ${receiver} = (${typeName}*)${ref}->instance;`)

  return {
    accessOperator: '->',
    className: info.name,
    expression: receiver,
    lines
  }
}

export function resolveNativeClassReceiverExpression(
  expression: ClassMaybeNode,
  context: ClassLookupContext
): CNativeClassReceiver | null {
  if (isThisObjectExpression(expression)) {
    const className = classNameForObject(context, 'this')

    if (className !== null && typeof className !== 'undefined' && isNativeClassObjectName(context, 'this', className)) {
      return {
        accessOperator: '->',
        className,
        expression: 'this',
        lines: []
      }
    }
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
    if (expression.path.length !== 1) {
      return null
    }

    const name = expression.path[0]
    let className = ''
    const objectClassName = classNameForObject(context, name)

    if (
      objectClassName !== null &&
      typeof objectClassName !== 'undefined' &&
      isNativeClassObjectName(context, name, objectClassName)
    ) {
      className = objectClassName
    } else {
      const expressionClassName = expression.className

      if (
        expressionClassName !== null &&
        typeof expressionClassName !== 'undefined' &&
        isNativeClassObjectName(context, name, expressionClassName)
      ) {
        className = expressionClassName
      }
    }

    if (className !== '') {
      return {
        accessOperator: '.',
        className,
        expression: emitCClassObjectReference(name, context),
        lines: []
      }
    }
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'MemberExpression') {
    const access = resolveNativeClassFieldAccess(expression, context)

    if (
      access !== null &&
      typeof access !== 'undefined' &&
      access.field.className !== null &&
      typeof access.field.className !== 'undefined'
    ) {
      const info = classInfoForName(context, access.field.className)

      if (info !== null && typeof info !== 'undefined' && info.native) {
        return {
          accessOperator: '.',
          className: access.field.className,
          expression: access.reference,
          lines: []
        }
      }
    }
  }

  return null
}

function isNativeClassObjectName(context: ClassLookupContext, objectName: string, className: string): boolean {
  const info = classInfoForName(context, className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return false
  }

  const valueType = classObjectValueType(context, objectName)

  return valueType === classValueType(info)
}

function classObjectValueType(context: ClassLookupContext, objectName: string): string | null {
  const localValue = context.localValueNames.has(objectName)

  if (!localValue) {
    const moduleValueType = context.moduleValueTypes.get(objectName)

    if (moduleValueType !== null && typeof moduleValueType !== 'undefined') {
      return moduleValueType
    }
  }

  const variableValueType = context.variables.get(objectName)

  if (variableValueType !== null && typeof variableValueType !== 'undefined') {
    return variableValueType
  }

  return null
}

function emitCClassObjectReference(name: string, context: ClassLookupContext): string {
  if (!context.localValueNames.has(name)) {
    const moduleName = context.moduleValueNames.get(name)

    if (moduleName !== null && typeof moduleName !== 'undefined') {
      return moduleName
    }
  }

  return emitCIdentifier(name)
}

function resolveNativeClassFieldAccess(
  expression: ClassMaybeNode,
  context: ClassLookupContext
): CNativeClassFieldAccess | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'MemberExpression') {
    return null
  }

  const receiver = resolveNativeClassReceiverExpression(expression.object, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return null
  }

  const info = classInfoForName(context, receiver.className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  const field = classFieldForName(info, expression.property)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  const reference = `${receiver.expression}${receiver.accessOperator}${emitCClassFieldName(field.name)}`

  return {
    accessOperator: receiver.accessOperator,
    field,
    info,
    objectExpression: receiver.expression,
    reference
  }
}

export function resolveNativeClassFieldMetadata(
  expression: AnyNode,
  context: ClassLookupContext
): CObjectShapeField | null {
  const access = resolveNativeClassFieldAccess(expression, context)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  return access.field
}

export function emitPreparedNativeClassFieldScalarExpression(
  expression: AnyNode,
  context: ClassLookupContext
): PreparedExpression | null {
  const access = resolveNativeClassFieldAccess(expression, context)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  if (access.field.valueType !== 'number' && access.field.valueType !== 'boolean') {
    return null
  }

  return {
    lines: [],
    expression: access.reference
  }
}

export function emitPreparedNativeClassFieldValueExpression(
  expression: AnyNode,
  context: ClassLookupContext
): PreparedExpression | null {
  const access = resolveNativeClassFieldAccess(expression, context)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  if (access.field.valueType === 'number') {
    return {
      lines: [],
      expression: `inox_number_value(${access.reference})`
    }
  }

  if (access.field.valueType === 'boolean') {
    return {
      lines: [],
      expression: `inox_bool_value(${access.reference})`
    }
  }

  if (classFieldUsesCppStringStorage(access.field)) {
    return {
      lines: [],
      expression: access.reference,
      cppType: 'inox::String',
      valueType: 'string'
    }
  }

  const libraryCppType = classFieldLibraryNativeCppType(access.field)

  if (libraryCppType !== null) {
    return {
      lines: [],
      expression: access.reference,
      cppType: libraryCppType,
      valueType: access.field.valueType
    }
  }

  if (access.field.className !== null && typeof access.field.className !== 'undefined') {
    const info = classInfoForName(context, access.field.className)

    if (info === null || typeof info === 'undefined' || !info.native) {
      return null
    }

    return {
      lines: [],
      expression: access.reference,
      valueType: cClassValueTypeName(access.field.className)
    }
  }

  return {
    lines: [],
    expression: classFieldUsesRuntimeValueStorage(access.field) ? `${access.reference}.raw()` : access.reference,
    valueType: access.field.valueType
  }
}

export function emitPreparedNativeClassInstanceExpression(
  expression: AnyNode,
  context: ClassLookupContext
): CNativeClassInstanceExpression | null {
  const receiver = resolveNativeClassReceiverExpression(expression, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return null
  }

  const info = classInfoForName(context, receiver.className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return null
  }

  let instanceExpression = `&${receiver.expression}`

  if (receiver.accessOperator === '->') {
    instanceExpression = receiver.expression
  }

  return {
    expression: instanceExpression,
    info,
    lines: receiver.lines
  }
}

export function hasNativeClassInstanceMethod(
  expression: AnyNode,
  methodName: string,
  argCount: number,
  context: ClassLookupContext
): boolean {
  const receiver = resolveNativeClassReceiverExpression(expression, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return false
  }

  const info = classInfoForName(context, receiver.className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return false
  }

  const method = resolveClassMethod(info, methodName)

  if (method === null || typeof method === 'undefined') {
    return false
  }

  return classMethodAcceptsArgumentCount(method.params, argCount)
}

export function hasNativeClassInstanceMethodReturnType(
  expression: AnyNode,
  methodName: string,
  argCount: number,
  returnType: string,
  context: ClassLookupContext
): boolean {
  const receiver = resolveNativeClassReceiverExpression(expression, context)

  if (receiver === null || typeof receiver === 'undefined') {
    return false
  }

  const info = classInfoForName(context, receiver.className)

  if (info === null || typeof info === 'undefined' || !info.native) {
    return false
  }

  const method = resolveClassMethod(info, methodName)

  if (method === null || typeof method === 'undefined') {
    return false
  }

  return method.returnType === returnType && classMethodAcceptsArgumentCount(method.params, argCount)
}

export function emitNativeClassFieldAssignment(expression: AnyNode, context: ClassFunctionContext): string[] | null {
  if (expression.type !== 'AssignmentExpression' || expression.target.type !== 'MemberExpression') {
    return null
  }

  const access = resolveNativeClassFieldAccess(expression.target, context)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  const lines: string[] = []

  if (classFieldUsesRuntimeValueStorage(access.field)) {
    const cppValueReference = cppValueRuntimeStringReference(expression.value, context)

    if (cppValueReference !== null && typeof cppValueReference !== 'undefined') {
      pushAllLines(lines, emitCClassFieldWriteLines(access.reference, cppValueReference, access.field))
      return lines
    }

    const value = emitClassValueExpression(context, expression.value)

    pushAllLines(lines, value.lines)
    pushAllLines(lines, emitCClassFieldWriteLines(access.reference, value.expression, access.field))
    return lines
  }

  const value = emitClassValueExpression(context, expression.value)

  pushAllLines(lines, value.lines)

  if (access.field.valueType === 'number') {
    if (value.scalarType === 'double' || value.cppType === 'double') {
      lines.push(`${access.reference} = ${value.expression};`)
    } else {
      lines.push(`${access.reference} = ${value.expression}.as.number;`)
    }
    return lines
  }

  if (access.field.valueType === 'boolean') {
    if (value.scalarType === 'bool' || value.cppType === 'bool') {
      lines.push(`${access.reference} = ${value.expression};`)
    } else {
      lines.push(`${access.reference} = ${value.expression}.as.boolean;`)
    }
    return lines
  }

  if (classFieldUsesCppStringStorage(access.field)) {
    if (value.cppType === 'inox::String') {
      lines.push(`${access.reference} = ${value.expression};`)
    } else {
      lines.push(`${access.reference} = inox::String(inox::Value(${value.expression}));`)
    }
    return lines
  }

  if (classFieldUsesNativeClassStorage(access.field)) {
    const className = access.field.className

    if (className === null || typeof className === 'undefined') {
      return lines
    }

    const valueClassName = cClassNameFromValueType(value.valueType)

    if (valueClassName !== null && typeof valueClassName !== 'undefined' && className === valueClassName) {
      lines.push(`${access.reference} = ${value.expression};`)
      return lines
    }

    lines.push(
      emitStatusCheck(
        `inox::class_assign_from_value(${value.expression}, &${emitCClassDescriptorNameForClassName(
          context,
          className
        )}, &${access.reference})`,
        context
      )
    )
    return lines
  }

  lines.push(`${access.reference} = ${value.expression};`)

  return lines
}

function classNameForObject(context: ClassLookupContext, objectName: string): string | null {
  const classInstanceTypes = context.classInstanceTypes

  if (classInstanceTypes === null || typeof classInstanceTypes === 'undefined') {
    return classNameForObjectValueType(context, objectName)
  }

  const className = classInstanceTypes.get(objectName)

  if (className !== null && typeof className !== 'undefined') {
    return className
  }

  return classNameForObjectValueType(context, objectName)
}

function classNameForObjectValueType(context: ClassLookupContext, objectName: string): string | null {
  const valueType = classObjectValueType(context, objectName)

  if (valueType === null || typeof valueType === 'undefined') {
    return null
  }

  return cClassNameFromValueType(valueType)
}

function classInfoForName(context: ClassLookupContext, className: string): CClassInfo | null {
  const classInfos = context.classInfos

  if (classInfos === null || typeof classInfos === 'undefined') {
    return null
  }

  const info = classInfos.get(className)

  if (info !== null && typeof info !== 'undefined') {
    return info
  }

  return null
}

function resolveClassMethod(info: CClassInfo, name: string): AnyNode | null {
  const method = info.methods.get(name)

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return null
}
