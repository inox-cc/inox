import { diagnostic } from '../../diagnostics.ts'
import { irClassMethodEffectName } from '../../ir.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
import { functionTakesEventLoopParam } from '../async/promises.ts'
import type {
  CEmitContext,
  CEventLoopContext,
  CFailureContext,
  CNameContext,
  COwnedPromiseContext,
  COwnedValueContext
} from '../context.ts'
import {
  emitEventLoopReference,
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitStatusCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue
} from '../context.ts'
import { cStringLiteral, emitCIdentifier } from '../identifiers.ts'
import { emitRuntimeNullableValueCheck, emitRuntimeValueCheck } from '../runtime-values.ts'
import type {
  CClassInfo,
  CClassMethod,
  CFunctionParam,
  CObjectShapeField,
  CPreparedCallArgs as PreparedCallArgs,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression
} from '../types.ts'
import { isReadonlyCObjectShapeField } from '../types.ts'
import {
  emitCScalarParamName,
  emitCStringParamName,
  emitCType,
  cRuntimeValueTag,
  isManagedRuntimeReturnType,
  isNullableScalarType,
  isOpaqueRuntimeValueType
} from '../value-types.ts'
import { emitObjectValueReference, resolveCObjectExpressionName } from './objects.ts'

export type ClassLoweringDependencies = {
  emitCFieldFlags(field: CObjectShapeField): string
  emitCValueExpression(expression: AnyNode, context: ClassFunctionContext): PreparedExpression
  emitPreparedCallArgs(expression: AnyNode, params: CFunctionParam[], context: ClassFunctionContext): PreparedCallArgs
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

type ClassFunctionContext = CFailureContext &
  CNameContext &
  CEventLoopContext &
  COwnedValueContext &
  COwnedPromiseContext & {
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
    localValueNames: Set<string>
    moduleValueNames: Map<string, string>
    objectShapes: Map<string, CObjectShapeField[]>
    throwingFunctions: Set<string>
    variables: Map<string, string>
  }
type ClassLookupContext = {
  classInfos: CClassInfoMap
  classInstanceTypes: Map<string, string>
  localValueNames: Set<string>
  moduleValueNames: Map<string, string>
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

type ClassInstanceRefValueContext = CFailureContext & CNameContext & COwnedValueContext

export type CNativeClassInstanceExpression = {
  expression: string
  info: CClassInfo
  lines: string[]
}

export type CClassMethodPrototypeMap = Map<string, string[]>

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

function emitCClassFieldName(name: string): string {
  return emitCIdentifier(name)
}

function emitCClassMethodIdentifier(name: string): string {
  return emitCIdentifier(name)
}

export function emitCClassMethodName(className: string, methodName: string): string {
  return `inox_method_${emitCIdentifier(className)}_${emitCIdentifier(methodName)}`
}

export function emitCClassDescriptorName(className: string): string {
  return `inox_class_descriptor_${emitCIdentifier(className)}`
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
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_class_instance_ref_copy(&inox_default_allocator, &${emitCClassDescriptorName(className)}, &${value.expression}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp,
    valueType: 'object'
  }
}

function emitCClassDescriptorFieldsName(className: string): string {
  return `${emitCClassDescriptorName(className)}_fields`
}

function emitCClassDescriptorFieldReaderName(className: string): string {
  return `${emitCClassDescriptorName(className)}_read_field`
}

function emitCClassDescriptorCopyInstanceName(className: string): string {
  return `${emitCClassDescriptorName(className)}_copy_instance`
}

function emitCClassDescriptorDestroyInstanceName(className: string): string {
  return `${emitCClassDescriptorName(className)}_destroy_instance`
}

function classValueType(info: CClassInfo): string {
  return cClassValueTypeName(info.name)
}

function classFieldUsesRuntimeValueStorage(field: CObjectShapeField): boolean {
  if (classFieldUsesNativeClassStorage(field)) {
    return false
  }

  return (
    field.valueType === 'unknown' ||
    isManagedRuntimeReturnType(field.valueType) ||
    isOpaqueRuntimeValueType(field.valueType) ||
    (field.nullable === true && isNullableScalarType(field.valueType))
  )
}

function classFieldUsesNativeClassStorage(field: CObjectShapeField): boolean {
  return (
    field.className !== null &&
    typeof field.className !== 'undefined' &&
    field.nullable !== true &&
    field.ownership !== 'weak'
  )
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

  return (
    field.valueType === 'number' ||
    field.valueType === 'boolean' ||
    field.valueType === 'string' ||
    field.valueType === 'date' ||
    field.valueType === 'regexp'
  )
}

function emitCClassFieldType(field: CObjectShapeField): string {
  if (classFieldUsesNativeClassStorage(field)) {
    return emitCClassTypeName(field.className)
  }

  if (classFieldUsesRuntimeValueStorage(field)) {
    return 'inox_value'
  }

  return emitCType(field.valueType)
}

function emitCClassFieldDefaultValue(field: CObjectShapeField): string {
  if (classFieldUsesNativeClassStorage(field)) {
    return emitCClassTypeName(field.className) + '()'
  }

  if (classFieldUsesRuntimeValueStorage(field)) {
    return 'inox_undefined_value()'
  }

  if (field.valueType === 'regexp') {
    return '{ 0, 0 }'
  }

  return '0'
}

function emitCClassParamType(param: CFunctionParam): string {
  if (
    param.className !== null &&
    typeof param.className !== 'undefined' &&
    param.nullable !== true &&
    param.ownership !== 'weak'
  ) {
    return 'const ' + emitCClassTypeName(param.className) + '&'
  }

  if (param.nullable === true && isNullableScalarType(param.valueType)) {
    return 'inox_value'
  }

  if (param.valueType === 'string') {
    return 'inox_value'
  }

  return emitCType(param.valueType)
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

  if (param.nullable === true && isNullableScalarType(param.valueType)) {
    return emitCScalarParamName(param.name)
  }

  if (param.valueType === 'string') {
    return emitCStringParamName(param.name)
  }

  return emitCIdentifier(param.name)
}

function emitCClassParamDeclaration(param: CFunctionParam): string {
  return `${emitCClassParamType(param)} ${emitCClassParamName(param)}`
}

function emitCClassParamDeclarations(params: CFunctionParam[]): string {
  const declarations: string[] = []

  for (const param of params) {
    declarations.push(emitCClassParamDeclaration(param))
  }

  return joinStrings(declarations, ', ')
}

function emitCClassFieldWriteLines(target: string, value: string, field: CObjectShapeField): string[] {
  if (!classFieldUsesRuntimeValueStorage(field)) {
    return [`${target} = ${value};`]
  }

  return [`inox_retain(${value});`, `inox_release(${target});`, `${target} = ${value};`]
}

function emitCClassConstructorInitializers(info: CClassInfo): string {
  const initializers: string[] = []

  for (const field of info.fields) {
    initializers.push(`${emitCClassFieldName(field.name)}(${emitCClassFieldDefaultValue(field)})`)
  }

  if (initializers.length === 0) {
    return ''
  }

  return ` : ${joinStrings(initializers, ', ')}`
}

function emitCClassDefaultConstructor(info: CClassInfo): string {
  return `${emitCClassTypeName(info.name)}()${emitCClassConstructorInitializers(info)} {}`
}

export function emitCClassConstructorPrototype(info: CClassInfo): string | null {
  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return null
  }

  const params: CFunctionParam[] = constructorMethod.params

  return `${emitCClassTypeName(info.name)}(${emitCClassParamDeclarations(params)});`
}

export function emitCClassConstructorHead(info: CClassInfo): string | null {
  const constructorMethod = info.constructor

  if (constructorMethod === null || typeof constructorMethod === 'undefined') {
    return null
  }

  const params: CFunctionParam[] = constructorMethod.params
  const typeName = emitCClassTypeName(info.name)
  const paramDeclarations = emitCClassParamDeclarations(params)
  const initializers = emitCClassConstructorInitializers(info)

  return typeName + '::' + typeName + '(' + paramDeclarations + ')' + initializers
}

function classHasRuntimeValueFields(info: CClassInfo): boolean {
  for (const field of info.fields) {
    if (classFieldUsesRuntimeValueStorage(field)) {
      return true
    }
  }

  return false
}

function emitCClassCopyConstructor(info: CClassInfo): string[] {
  const initializers: string[] = []

  for (const field of info.fields) {
    const name = emitCClassFieldName(field.name)
    initializers.push(`${name}(other.${name})`)
  }

  const suffix = initializers.length > 0 ? ` : ${joinStrings(initializers, ', ')}` : ''
  const lines = [`${emitCClassTypeName(info.name)}(const ${emitCClassTypeName(info.name)}& other)${suffix} {`]

  for (const field of info.fields) {
    if (classFieldUsesRuntimeValueStorage(field)) {
      lines.push(`  inox_retain(${emitCClassFieldName(field.name)});`)
    }
  }

  lines.push('}')

  return lines
}

function emitCClassAssignmentOperator(info: CClassInfo): string[] {
  const typeName = emitCClassTypeName(info.name)
  const lines = [`${typeName}& operator=(const ${typeName}& other) {`, '  if (this != &other) {']

  for (const field of info.fields) {
    const name = emitCClassFieldName(field.name)

    if (classFieldUsesRuntimeValueStorage(field)) {
      lines.push(`    inox_retain(other.${name});`)
      lines.push(`    inox_release(${name});`)
      lines.push(`    ${name} = other.${name};`)
    } else {
      lines.push(`    ${name} = other.${name};`)
    }
  }

  lines.push('  }')
  lines.push('  return *this;')
  lines.push('}')

  return lines
}

function emitCClassDestructor(info: CClassInfo): string[] {
  const lines = [`~${emitCClassTypeName(info.name)}() {`]

  for (const field of info.fields) {
    if (classFieldUsesRuntimeValueStorage(field)) {
      lines.push(`  inox_release(${emitCClassFieldName(field.name)});`)
    }
  }

  lines.push('}')

  return lines
}

function pushIndentedClassLines(target: string[], lines: string[]): void {
  for (const line of lines) {
    target.push(`  ${line}`)
  }
}

export function emitCNativeClassDeclarations(
  context: CEmitContext,
  methodPrototypes: CClassMethodPrototypeMap
): string[] {
  const lines: string[] = []

  for (const info of context.classInfos.values()) {
    if (!info.native) {
      continue
    }

    lines.push(`class ${emitCClassTypeName(info.name)} {`)
    lines.push('public:')

    for (const field of info.fields) {
      lines.push(`  ${emitCClassFieldType(field)} ${emitCClassFieldName(field.name)};`)
    }

    if (info.fields.length > 0) {
      lines.push('')
    }

    const constructorPrototype = emitCClassConstructorPrototype(info)

    if (constructorPrototype !== null && typeof constructorPrototype !== 'undefined') {
      if (!classHasNoArgConstructor(info)) {
        lines.push(`  ${emitCClassDefaultConstructor(info)}`)
      }

      lines.push(`  ${constructorPrototype}`)
    } else {
      lines.push(`  ${emitCClassDefaultConstructor(info)}`)
    }

    if (classHasRuntimeValueFields(info)) {
      pushIndentedClassLines(lines, emitCClassCopyConstructor(info))
      pushIndentedClassLines(lines, emitCClassAssignmentOperator(info))
      pushIndentedClassLines(lines, emitCClassDestructor(info))
    }

    const prototypes = methodPrototypes.get(info.name)

    if (prototypes !== null && typeof prototypes !== 'undefined') {
      for (const prototype of prototypes) {
        lines.push(`  ${prototype}`)
      }
    }

    lines.push('};')
    lines.push('')
  }

  return lines
}

export function emitCClassDescriptorDeclarations(context: CEmitContext): string[] {
  const lines: string[] = []

  for (const info of context.classInfos.values()) {
    pushAllLines(lines, emitCClassDescriptorDeclaration(info))
  }

  return lines
}

function emitCClassDescriptorDeclaration(info: CClassInfo): string[] {
  const fieldsName = emitCClassDescriptorFieldsName(info.name)
  const lines: string[] = []

  if (info.fields.length > 0) {
    lines.push(`static const inox_class_field_descriptor ${fieldsName}[] = {`)

    for (const field of info.fields) {
      lines.push(
        `  { ${cStringLiteral(field.name)}, ${emitCClassDescriptorString(field.valueType)}, ${emitCClassDescriptorString(
          classFieldDeclaredType(field)
        )}, ${emitCClassDescriptorString(classFieldOwnership(field))}, ${emitCClassDescriptorFieldFlags(field)} },`
      )
    }

    lines.push('};')
  }

  if (info.native) {
    pushAllLines(lines, emitCClassDescriptorCopyInstanceDeclaration(info))
    pushAllLines(lines, emitCClassDescriptorDestroyInstanceDeclaration(info))
    pushAllLines(lines, emitCClassDescriptorFieldReaderDeclaration(info))
  }

  lines.push(`static const inox_class_descriptor ${emitCClassDescriptorName(info.name)} = {`)
  lines.push(`  ${cStringLiteral(info.name)},`)
  lines.push(`  ${info.fields.length},`)
  if (info.fields.length === 0) {
    lines.push('  0,')
  } else {
    lines.push(`  ${fieldsName},`)
  }
  if (info.native) {
    lines.push(`  ${emitCClassDescriptorFieldReaderName(info.name)},`)
    lines.push(`  ${emitCClassDescriptorCopyInstanceName(info.name)},`)
    lines.push(`  ${emitCClassDescriptorDestroyInstanceName(info.name)}`)
  } else {
    lines.push('  0,')
    lines.push('  0,')
    lines.push('  0')
  }
  lines.push('};')
  lines.push('')

  return lines
}

function emitCClassDescriptorCopyInstanceDeclaration(info: CClassInfo): string[] {
  const copyName = emitCClassDescriptorCopyInstanceName(info.name)
  const typeName = emitCClassTypeName(info.name)
  const lines = [
    `static inox_status ${copyName}(inox_allocator* allocator, const void* instance, void** out) {`
  ]

  lines.push('  if (allocator == 0 || allocator->alloc == 0 || instance == 0 || out == 0) {')
  lines.push('    return INOX_ERR_TYPE;')
  lines.push('  }')
  lines.push(`  void* memory = allocator->alloc(allocator->user, sizeof(${typeName}), alignof(${typeName}));`)
  lines.push('  if (memory == 0) {')
  lines.push('    *out = 0;')
  lines.push('    return INOX_ERR_OOM;')
  lines.push('  }')
  lines.push(`  new (memory) ${typeName}(*(const ${typeName}*)instance);`)
  lines.push('  *out = memory;')
  lines.push('  return INOX_OK;')
  lines.push('}')
  lines.push('')

  return lines
}

function emitCClassDescriptorDestroyInstanceDeclaration(info: CClassInfo): string[] {
  const destroyName = emitCClassDescriptorDestroyInstanceName(info.name)
  const typeName = emitCClassTypeName(info.name)
  const lines = [`static void ${destroyName}(inox_allocator* allocator, void* instance) {`]

  lines.push('  if (allocator == 0 || allocator->free == 0 || instance == 0) {')
  lines.push('    return;')
  lines.push('  }')
  lines.push(`  ((${typeName}*)instance)->~${typeName}();`)
  lines.push(`  allocator->free(allocator->user, instance, sizeof(${typeName}), alignof(${typeName}));`)
  lines.push('}')
  lines.push('')

  return lines
}

function emitCClassDescriptorFieldReaderDeclaration(info: CClassInfo): string[] {
  const readerName = emitCClassDescriptorFieldReaderName(info.name)
  const typeName = emitCClassTypeName(info.name)
  const lines = [`static inox_status ${readerName}(const void* instance, uint32_t index, inox_value* out) {`]

  lines.push('  if (instance == 0 || out == 0) {')
  lines.push('    return INOX_ERR_TYPE;')
  lines.push('  }')
  lines.push(`  const ${typeName}* value = (const ${typeName}*)instance;`)

  if (info.fields.length > 0) {
    lines.push('  switch (index) {')

    for (let index = 0; index < info.fields.length; index = index + 1) {
      const field = info.fields[index]
      lines.push(`    case ${index}:`)
      pushIndentedClassLines(lines, emitCClassDescriptorFieldReadLines(field))
    }

    lines.push('  }')
  }

  lines.push('  return INOX_ERR_FIELD;')
  lines.push('}')
  lines.push('')

  return lines
}

function emitCClassDescriptorFieldReadLines(field: CObjectShapeField): string[] {
  const reference = `value->${emitCClassFieldName(field.name)}`

  if (field.valueType === 'number' || field.valueType === 'date') {
    return [`*out = inox_number_value(${reference});`, 'return INOX_OK;']
  }

  if (field.valueType === 'boolean') {
    return [`*out = inox_bool_value(${reference});`, 'return INOX_OK;']
  }

  if (classFieldUsesRuntimeValueStorage(field)) {
    return [`*out = ${reference};`, 'inox_retain(*out);', 'return INOX_OK;']
  }

  if (classFieldUsesNativeClassStorage(field)) {
    return [
      `return inox_class_instance_ref_copy(&inox_default_allocator, &${emitCClassDescriptorName(field.className)}, &${reference}, out);`
    ]
  }

  return ['*out = inox_undefined_value();', 'return INOX_OK;']
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

export function createClassInfos(classes: AnyNode[], diagnostics: Diagnostic[]): CClassInfoMap {
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
  const methods: ClassExpressionNode[] = classNode.methods

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
    const methodList: ClassExpressionNode[] = info.node.methods

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
    const statements: ClassExpressionNode[] = constructorMethod.body
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

      diagnostics.push(
        diagnostic(
          'INOX_C_CLASS',
          `class ${classNode.name} constructor currently supports only local declarations, local assignments and this.field assignments in the C backend`,
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
    arrayElementType: field.arrayElementType,
    arrayElementDeclaredType: field.arrayElementDeclaredType,
    className: field.className,
    declaredType: field.declaredType,
    mapKeyType: field.mapKeyType,
    mapValueType: field.mapValueType,
    setElementType: field.setElementType,
    shape: field.shape,
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
    return 'array'
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
  const info = resolveClassConstructorInfo(statement.init, context)

  if (info !== null && typeof info !== 'undefined') {
    return emitSupportedClassObjectVariableDeclaration(statement, info, context)
  }

  context.diagnostics.push(
    diagnostic(
      'INOX_C_CLASS',
      'this class constructor is not supported by the current C backend slice',
      nodeLocOrFallback(statement.init, statement)
    )
  )

  return [`inox_value ${statement.name} = inox_undefined_value();`]
}

function emitSupportedClassObjectVariableDeclaration(
  statement: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  if (!info.native) {
    registerOwnedValue(context, statement.name)
    context.variables.set(statement.name, 'object')
    registerClassInstanceType(context, statement.name, info.name)
    registerClassObjectShape(context, statement.name, info)

    return emitCClassRuntimeObjectInitLines(statement.name, statement.init, info, context)
  }

  context.variables.set(statement.name, classValueType(info))
  registerClassInstanceType(context, statement.name, info.name)
  return emitCNativeClassVariableDeclaration(statement.name, statement.init, info, context)
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
      'this class constructor is not supported by the current C backend slice',
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
  pushAllLines(lines, emitPrepareOwnedValueWrite(target))
  lines.push(emitStatusCheck(`inox_object_new(&inox_default_allocator, &${shapeName}, &${target})`, context))

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
    const value = emitClassValueExpression(context, valueExpression)
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
      arrayElementType: field.arrayElementType,
      arrayElementDeclaredType: field.arrayElementDeclaredType,
      className: field.className,
      declaredType: field.declaredType,
      mapKeyType: field.mapKeyType,
      mapValueType: field.mapValueType,
      setElementType: field.setElementType,
      shape: field.shape,
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

  for (let index = 0; index < params.length; index = index + 1) {
    const param = params[index]

    if (expression.args[index] !== null && typeof expression.args[index] !== 'undefined') {
      args.set(param.name, expression.args[index])
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
    type: node.type,
    callee: substituteClassConstructorParams(node.callee, args, target),
    args: callArgs,
    valueType: node.valueType,
    loc: node.loc
  }
}

export function emitCNativeClassAssignmentLines(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  const prepared = emitPreparedClassCallArgs(context, expression, classConstructorParams(info))
  const lines: string[] = []

  pushAllLines(lines, prepared.lines)
  lines.push(`${target} = ${emitCClassTypeName(info.name)}(${joinStrings(prepared.args, ', ')});`)

  return lines
}

function emitCNativeClassVariableDeclaration(
  target: string,
  expression: AnyNode,
  info: CClassInfo,
  context: ClassFunctionContext
): string[] {
  const prepared = emitPreparedClassCallArgs(context, expression, classConstructorParams(info))
  const lines: string[] = []

  pushAllLines(lines, prepared.lines)

  if (prepared.args.length === 0) {
    lines.push(`${emitCClassTypeName(info.name)} ${emitCIdentifier(target)};`)
  } else {
    lines.push(`${emitCClassTypeName(info.name)} ${emitCIdentifier(target)}(${joinStrings(prepared.args, ', ')});`)
  }

  return lines
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
): PreparedExpression {
  const method = resolveClassMethod(call.info, call.methodName)

  if (method !== null && typeof method !== 'undefined') {
    return emitKnownPreparedClassMethodCallExpression(expression, context, call, method, options)
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

  if (isThrowingClassMethod(call.info, method, context)) {
    return emitPreparedThrowingClassMethodCallExpression(call, method, callLines, prepared, context)
  }

  const callExpression = emitClassMethodCallExpression(call, method, prepared, context)

  if (method.returnType === 'promise') {
    let out = callExpression
    let promiseValueType = 'unknown'
    const methodPromiseValueType = method.returnPromiseValueType

    if (methodPromiseValueType !== null && typeof methodPromiseValueType !== 'undefined') {
      promiseValueType = methodPromiseValueType
    }

    if (options.out !== null && typeof options.out !== 'undefined') {
      out = options.out
    }

    registerOwnedPromise(context, out, promiseValueType, 'unknown')

    if (out === callExpression) {
      return {
        lines: callLines,
        expression: out,
        valueType: 'promise',
        rejectionValueType: 'unknown'
      }
    }

    const lines: string[] = []
    pushAllLines(lines, callLines)
    lines.push(`${out} = ${callExpression};`)

    return {
      lines,
      expression: out,
      valueType: 'promise',
      rejectionValueType: 'unknown'
    }
  }

  if (isManagedRuntimeReturnType(method.returnType)) {
    const value = nextCName(context, 'inox_method_value')
    const tag = cRuntimeValueTag(method.returnType)
    registerOwnedValue(context, value)
    const lines: string[] = []
    pushAllLines(lines, callLines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(value))
    lines.push(`${value} = ${callExpression};`)

    if (method.returnNullable === true) {
      pushAllLines(lines, emitRuntimeNullableValueCheck(value, tag, context))
    } else {
      lines.push(emitRuntimeValueCheck(value, tag, context))
    }

    return {
      lines,
      expression: value
    }
  }

  let expressionText = callExpression

  if (method.returnType === 'void') {
    expressionText = `${callExpression}`
  }

  return {
    lines: callLines,
    expression: expressionText
  }
}

function emitPreparedThrowingClassMethodCallExpression(
  call: ClassMethodCallInfo,
  method: AnyNode,
  callLines: string[],
  prepared: PreparedCallArgs,
  context: ClassFunctionContext
): PreparedExpression {
  const callArgs: string[] = []
  const lines: string[] = []
  let result = ''

  if (classMethodTakesEventLoopParam(call.info, method, context)) {
    registerEventLoop(context)
    callArgs.push(emitEventLoopReference(context))
  }

  if (!call.native) {
    callArgs.push(call.objectExpression)
  }

  for (const arg of prepared.args) {
    callArgs.push(arg)
  }

  pushAllLines(lines, callLines)
  registerClassMethodErrorChannel(context)
  pushAllLines(lines, emitPrepareOwnedValueWrite('inox_error'))

  if (method.returnType !== 'void') {
    result = nextCName(context, 'inox_method_result')

    if (isThrowingClassMethodRuntimeOut(method)) {
      lines.push(`inox_value ${result} = inox_undefined_value();`)
    } else {
      lines.push(`double ${result} = 0;`)
    }

    callArgs.push(`&${result}`)
  }

  callArgs.push('&inox_error')

  const status = nextCName(context, 'inox_method_status')
  let callExpression = `${call.objectExpression}${call.accessOperator}${emitCClassMethodIdentifier(method.name)}(${joinStrings(
    callArgs,
    ', '
  )})`

  if (!call.native) {
    callExpression = `${emitCClassMethodName(call.info.name, method.name)}(${joinStrings(callArgs, ', ')})`
  }

  lines.push(`inox_status ${status} = ${callExpression};`)
  pushAllLines(lines, emitThrowingClassMethodStatusCheck(status, context))

  return {
    lines,
    expression: result
  }
}

function isThrowingClassMethodRuntimeOut(method: AnyNode): boolean {
  return (
    method.returnType === 'unknown' ||
    isManagedRuntimeReturnType(method.returnType) ||
    isOpaqueRuntimeValueType(method.returnType) ||
    (method.returnNullable === true && isNullableScalarType(method.returnType))
  )
}

function emitThrowingClassMethodStatusCheck(status: string, context: ClassFunctionContext): string[] {
  const target = currentClassErrorTarget(context)
  const lines = [`if (${status} == INOX_ERR_THROW) {`, '  inox_error_active = 1;']

  if (target !== null && typeof target !== 'undefined') {
    lines.push(`  goto ${target};`)
  } else if (context.throwingFunction) {
    lines.push('  inox_status_result = INOX_ERR_THROW;')
    lines.push('  goto inox_cleanup;')
  } else {
    lines.push(`  ${emitFailureStatement(context)}`)
  }

  lines.push('}')
  lines.push(`if (${status} != INOX_OK) ${emitFailureStatement(context)}`)

  return lines
}

function currentClassErrorTarget(context: ClassFunctionContext): string | null {
  const targets = context.errorTargets

  if (targets === null || typeof targets === 'undefined' || targets.length === 0) {
    return null
  }

  return targets[targets.length - 1]
}

function registerClassMethodErrorChannel(context: ClassFunctionContext): void {
  context.errorChannelUsed = true
  registerOwnedValue(context, 'inox_error')
}

function isThrowingClassMethod(info: CClassInfo, method: AnyNode, context: ClassFunctionContext): boolean {
  const throwingFunctions = context.throwingFunctions

  if (throwingFunctions === null || typeof throwingFunctions === 'undefined') {
    return false
  }

  const methodEffectName = irClassMethodEffectName(info.name, method.name)
  return throwingFunctions.has(methodEffectName)
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
    args.push(emitEventLoopReference(context))
  }

  for (const arg of prepared.args) {
    args.push(arg)
  }

  if (!call.native) {
    args.unshift(call.objectExpression)
    return `${emitCClassMethodName(call.info.name, method.name)}(${joinStrings(args, ', ')})`
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

      return {
        accessOperator: info.native ? '.' : '.',
        info,
        methodName: expression.callee.property,
        native: info.native && object.valueType === classValueType(info),
        objectExpression: object.expression,
        objectLines: object.lines
      }
    }
  }

  return null
}

export function resolveNativeClassReceiverExpression(
  expression: ClassMaybeNode,
  context: ClassLookupContext
): CNativeClassReceiver | null {
  if (isThisObjectExpression(expression)) {
    const className = classNameForObject(context, 'this')

    if (
      className !== null &&
      typeof className !== 'undefined' &&
      isNativeClassObjectName(context, 'this', className)
    ) {
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

  const valueType = context.variables.get(objectName)

  return valueType === classValueType(info)
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

  if (access.field.valueType !== 'number' && access.field.valueType !== 'boolean' && access.field.valueType !== 'date') {
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

  if (access.field.valueType === 'number' || access.field.valueType === 'date') {
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

  if (
    access.field.className !== null &&
    typeof access.field.className !== 'undefined'
  ) {
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
    expression: access.reference,
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

export function emitNativeClassFieldAssignment(
  expression: AnyNode,
  context: ClassFunctionContext
): string[] | null {
  if (expression.type !== 'AssignmentExpression' || expression.target.type !== 'MemberExpression') {
    return null
  }

  const access = resolveNativeClassFieldAccess(expression.target, context)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  const lines: string[] = []

  if (classFieldUsesRuntimeValueStorage(access.field)) {
    const value = emitClassValueExpression(context, expression.value)

    pushAllLines(lines, value.lines)
    pushAllLines(lines, emitCClassFieldWriteLines(access.reference, value.expression, access.field))
    return lines
  }

  const value = emitClassValueExpression(context, expression.value)

  pushAllLines(lines, value.lines)

  if (access.field.valueType === 'number' || access.field.valueType === 'date') {
    lines.push(`${access.reference} = ${value.expression}.as.number;`)
    return lines
  }

  if (access.field.valueType === 'boolean') {
    lines.push(`${access.reference} = ${value.expression}.as.boolean;`)
    return lines
  }

  lines.push(`${access.reference} = ${value.expression};`)

  return lines
}

function classNameForObject(context: ClassLookupContext, objectName: string): string | null {
  const classInstanceTypes = context.classInstanceTypes

  if (classInstanceTypes === null || typeof classInstanceTypes === 'undefined') {
    return null
  }

  const className = classInstanceTypes.get(objectName)

  if (className !== null && typeof className !== 'undefined') {
    return className
  }

  return null
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
