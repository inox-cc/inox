import type { AnyNode } from '../types.ts'
import {
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  nextCName,
  registerEventLoop,
  registerOwnedPromise,
  registerOwnedValue
} from './context.ts'
import type { CFunctionContext } from './context.ts'
import { cStringLiteral, emitCIdentifier } from './identifiers.ts'
import type {
  CFunctionType,
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from './types.ts'

type CompilerLibraryCArgumentSource = {
  argumentIndex: number
  objectFieldName?: string
}

type CompilerLibraryExpressionNode = AnyNode & {
  libraryCExpression?: string | null
  libraryCLowering?: string | null
  libraryCArgumentAdapters?: string[] | null
  libraryCArgumentKinds?: string[] | null
  libraryCArgumentSources?: Array<CompilerLibraryCArgumentSource | null> | null
  libraryCResultShapeFields?: string[] | null
  libraryCCallStyle?: string | null
  libraryCFailureMode?: string | null
  libraryCResultMode?: string | null
  libraryCReceiverAdapter?: string | null
  libraryConstantValue?: string | null
  libraryCallbackLifetime?: string | null
  libraryCppType?: string | null
  libraryOwned?: boolean | null
  promiseRejectionValueType?: string | null
  promiseValueType?: string | null
}

type CompilerLibraryNativeFieldContext = {
  cppValueTypes: Map<string, string>
  localValueNames: Set<string>
  moduleObjectShapes: Map<string, CObjectShapeField[]>
  moduleValueNames: Map<string, string>
  objectShapes: Map<string, CObjectShapeField[]>
}

export type CompilerLibraryLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedNumberExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedNumberFromStringExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedStringConversionExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedStringBytesOperand(
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ): PreparedStringBytesOperand
  emitRuntimeCallbackValue(
    expression: AnyNode,
    functionType: CFunctionType | null | undefined,
    context: CFunctionContext
  ): PreparedExpression
  emitThrownCheckLines(context: CFunctionContext): string[]
  inferExpressionType(expression: AnyNode, context: CFunctionContext): string
  registerObjectShape(context: CFunctionContext, name: string, shape: CObjectShape | null | undefined): void
}

export function emitPreparedCompilerLibraryExpression(expression: AnyNode): PreparedExpression | null {
  const item = expression as CompilerLibraryExpressionNode
  const cExpression = item.libraryCExpression
  const declaredCppType = item.libraryCppType
  const scalarType = compilerLibraryScalarType(item.valueType)
  const cppType = declaredCppType ?? scalarType
  const argumentKinds = item.libraryCArgumentKinds

  if (
    cExpression === null ||
    typeof cExpression === 'undefined' ||
    cppType === null ||
    typeof cppType === 'undefined' ||
    (argumentKinds !== null && typeof argumentKinds !== 'undefined')
  ) {
    return null
  }

  return {
    lines: [],
    expression: cExpression,
    cppType,
    owned: item.libraryOwned === true
  }
}

export function isCompilerLibraryNativeFieldExpression(
  expression: AnyNode,
  context: CompilerLibraryNativeFieldContext
): boolean {
  return compilerLibraryNativeField(expression, context) !== null
}

export function emitPreparedCompilerLibraryNativeFieldExpression(
  expression: AnyNode,
  context: CompilerLibraryNativeFieldContext,
  preparedObject: PreparedExpression | null
): PreparedExpression | null {
  const field = compilerLibraryNativeField(expression, context)

  if (field === null) {
    return null
  }

  let lines: string[] = []
  let objectReference = ''
  let objectCppType: string | null | undefined = null
  const directReference = expression.object.type === 'Reference' && expression.object.path.length === 1

  if (directReference) {
    const objectName = expression.object.path[0]
    objectCppType = context.cppValueTypes.get(objectName)
    objectReference = emitCIdentifier(objectName)

    if (!context.localValueNames.has(objectName)) {
      objectReference = context.moduleValueNames.get(objectName) ?? objectReference
    }
  } else {
    if (preparedObject === null) {
      return null
    }

    objectCppType = preparedObject.cppType
    lines = preparedObject.lines
    objectReference = `(${preparedObject.expression})`
  }

  if (
    objectCppType === null ||
    typeof objectCppType === 'undefined' ||
    objectCppType === 'inox::Value'
  ) {
    return null
  }

  return {
    lines,
    expression: `${objectReference}.${emitCIdentifier(field.libraryCMember)}`,
    cppType: compilerLibraryNativeFieldCppType(field),
    runtimeTypeChecked: true,
    valueType: field.valueType
  }
}

function compilerLibraryNativeField(
  expression: AnyNode,
  context: CompilerLibraryNativeFieldContext
): CObjectShapeField | null {
  if (expression.type !== 'MemberExpression') {
    return null
  }

  let fields: CObjectShapeField[] | null = null
  const directReference = expression.object.type === 'Reference' && expression.object.path.length === 1

  if (directReference) {
    const objectName = expression.object.path[0]
    fields = context.objectShapes.get(objectName) ?? context.moduleObjectShapes.get(objectName) ?? null
  } else {
    const shape = expression.object.shape as CObjectShape | null | undefined
    fields = shape?.fields ?? null
  }

  if (fields === null) {
    return null
  }

  let field: CObjectShapeField | null = null

  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === expression.property) {
      field = fields[index]
      break
    }
  }

  if (field === null) {
    return null
  }

  const cMember = field.libraryCMember

  if (typeof cMember !== 'string' || cMember === '') {
    return null
  }

  return field
}

function compilerLibraryNativeFieldCppType(field: CObjectShapeField): string | undefined {
  if (typeof field.libraryCppType === 'string') {
    return field.libraryCppType
  }

  if (field.valueType === 'string') {
    return 'inox::String'
  }

  if (field.valueType === 'number') {
    return 'double'
  }

  if (field.valueType === 'boolean') {
    return 'bool'
  }

  if (typeof field.shape?.libraryCppType === 'string') {
    return field.shape.libraryCppType
  }

  return undefined
}

export function emitPreparedCompilerLibraryCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies,
  options?: PreparedCallOptions | null
): PreparedExpression | null {
  const item = expression as CompilerLibraryExpressionNode
  const lowered = emitPreparedCompilerLibraryIntrinsicExpression(expression, item, context, dependencies)

  if (lowered !== null) {
    return lowered
  }

  const target = item.libraryCExpression
  const argumentKinds = item.libraryCArgumentKinds
  const argumentSources = item.libraryCArgumentSources
  const declaredCppType = item.libraryCppType
  const scalarType = compilerLibraryScalarType(item.valueType)
  const cppType = declaredCppType ?? scalarType

  if (
    (expression.type !== 'CallExpression' &&
      expression.type !== 'NewExpression' &&
      expression.type !== 'AssignmentExpression' &&
      expression.type !== 'MemberExpression' &&
      expression.type !== 'IndexExpression' &&
      expression.type !== 'RegExpLiteral') ||
    target === null ||
    typeof target === 'undefined' ||
    argumentKinds === null ||
    typeof argumentKinds === 'undefined' ||
    cppType === null ||
    typeof cppType === 'undefined'
  ) {
    return null
  }

  const lines: string[] = []
  const argumentsList: string[] = []
  let sourceArgumentIndex = 0
  let optionalArgumentPresent = false
  let receiverExpression = ''
  let receiverCppType: string | null | undefined = null
  let stringViewArrayCount = 0
  const sourceArguments = compilerLibrarySourceArguments(expression)

  for (let kindIndex = 0; kindIndex < argumentKinds.length; kindIndex = kindIndex + 1) {
    const kind = argumentKinds[kindIndex]
    let argumentSource: CompilerLibraryCArgumentSource | null = null

    if (
      argumentSources !== null &&
      typeof argumentSources !== 'undefined' &&
      kindIndex < argumentSources.length
    ) {
      argumentSource = argumentSources[kindIndex]
    }

    if (kind === 'receiver') {
      const receiver = compilerLibraryReceiver(expression)

      if (receiver === null) {
        return null
      }

      const prepared = dependencies.emitCValueExpression(receiver, context)
      pushLines(lines, prepared.lines)
      receiverExpression = prepared.expression
      receiverCppType = prepared.cppType
      continue
    }

    if (kind === 'member-name-string-view') {
      const memberName = compilerLibraryMemberName(expression)

      if (memberName !== null) {
        argumentsList.push(cStringLiteral(memberName))
        continue
      }

      const memberExpression = compilerLibraryDynamicMemberExpression(expression)

      if (memberExpression === null) {
        return null
      }

      const prepared = dependencies.emitPreparedStringBytesOperand(
        memberExpression,
        context,
        'inox_library_member'
      )
      pushLines(lines, prepared.lines)
      argumentsList.push(emitCompilerLibraryStringArgument(prepared))
      continue
    }

    if (kind === 'string-view' || kind === 'optional-string-view') {
      let sourceArgument: AnyNode | null = null

      if (sourceArgumentIndex < sourceArguments.length) {
        sourceArgument = sourceArguments[sourceArgumentIndex]
      }

      sourceArgumentIndex = sourceArgumentIndex + 1
      optionalArgumentPresent = sourceArgument !== null

      if (sourceArgument === null) {
        argumentsList.push('inox::StringView("", 0)')
        continue
      }

      const prepared = dependencies.emitPreparedStringBytesOperand(
        sourceArgument,
        context,
        'inox_library_arg'
      )
      pushLines(lines, prepared.lines)
      argumentsList.push(emitCompilerLibraryStringArgument(prepared))
      continue
    }

    if (kind === 'string-view-or-value') {
      const sourceArgument = sourceArguments[sourceArgumentIndex]
      sourceArgumentIndex = sourceArgumentIndex + 1

      if (sourceArgument === null || typeof sourceArgument === 'undefined') {
        return null
      }

      if (dependencies.inferExpressionType(sourceArgument, context) === 'string') {
        const prepared = dependencies.emitPreparedStringBytesOperand(
          sourceArgument,
          context,
          'inox_library_arg'
        )
        pushLines(lines, prepared.lines)
        argumentsList.push(emitCompilerLibraryStringArgument(prepared))
      } else {
        const prepared = dependencies.emitCValueExpression(sourceArgument, context)
        pushLines(lines, prepared.lines)

        if (prepared.cppType !== null && typeof prepared.cppType !== 'undefined') {
          argumentsList.push(prepared.expression)
        } else {
          argumentsList.push(`inox::Value(${prepared.expression})`)
        }
      }

      continue
    }

    if (kind === 'argument-presence') {
      argumentsList.push(optionalArgumentPresent ? 'true' : 'false')
      continue
    }

    if (kind === 'object-boolean-field') {
      if (
        argumentSource === null ||
        argumentSource.objectFieldName === null ||
        typeof argumentSource.objectFieldName === 'undefined'
      ) {
        return null
      }

      argumentsList.push(
        compilerLibraryObjectBooleanLiteral(
          sourceArguments[argumentSource.argumentIndex],
          argumentSource.objectFieldName
        ) ? 'true' : 'false'
      )
      continue
    }

    if (kind === 'object-string-field') {
      if (
        argumentSource === null ||
        argumentSource.objectFieldName === null ||
        typeof argumentSource.objectFieldName === 'undefined'
      ) {
        return null
      }

      const field = compilerLibraryObjectField(
        sourceArguments[argumentSource.argumentIndex],
        argumentSource.objectFieldName
      )

      optionalArgumentPresent = field !== null

      if (field === null) {
        argumentsList.push('inox::StringView("", 0)')
        continue
      }

      const prepared = dependencies.emitPreparedStringBytesOperand(
        field,
        context,
        'inox_library_option'
      )
      pushLines(lines, prepared.lines)
      argumentsList.push(emitCompilerLibraryStringArgument(prepared))
      continue
    }

    if (kind === 'object-number-field') {
      if (
        argumentSource === null ||
        argumentSource.objectFieldName === null ||
        typeof argumentSource.objectFieldName === 'undefined'
      ) {
        return null
      }

      const field = compilerLibraryObjectField(
        sourceArguments[argumentSource.argumentIndex],
        argumentSource.objectFieldName
      )

      optionalArgumentPresent = field !== null

      if (field === null) {
        argumentsList.push('0')
        continue
      }

      const prepared = dependencies.emitPreparedNumberExpression(field, context)
      pushLines(lines, prepared.lines)
      argumentsList.push(prepared.expression)
      continue
    }

    if (kind === 'runtime-callback' || kind === 'optional-runtime-callback') {
      let callbackArgumentIndex = sourceArgumentIndex

      if (argumentSource !== null) {
        callbackArgumentIndex = argumentSource.argumentIndex
      } else {
        sourceArgumentIndex = sourceArgumentIndex + 1
      }

      const callback = sourceArguments[callbackArgumentIndex]

      if (callback === null || typeof callback === 'undefined') {
        if (kind === 'runtime-callback') {
          return null
        }

        argumentsList.push('inox_undefined_value()')
        continue
      }

      const prepared = dependencies.emitRuntimeCallbackValue(
        callback,
        callback.functionType,
        context
      )
      pushLines(lines, prepared.lines)
      argumentsList.push(prepared.expression)

      if (item.libraryCallbackLifetime === 'event-loop') {
        registerEventLoop(context)
      }

      continue
    }

    if (kind === 'value') {
      const sourceArgument = sourceArguments[sourceArgumentIndex]
      sourceArgumentIndex = sourceArgumentIndex + 1

      if (sourceArgument === null || typeof sourceArgument === 'undefined') {
        return null
      }

      const prepared = dependencies.emitCValueExpression(sourceArgument, context)
      pushLines(lines, prepared.lines)
      argumentsList.push(prepared.expression)
      continue
    }

    if (kind === 'number') {
      const sourceArgument = sourceArguments[sourceArgumentIndex]
      sourceArgumentIndex = sourceArgumentIndex + 1

      if (sourceArgument === null || typeof sourceArgument === 'undefined') {
        return null
      }

      const prepared = dependencies.emitPreparedNumberExpression(sourceArgument, context)
      pushLines(lines, prepared.lines)
      argumentsList.push(prepared.expression)
      continue
    }

    if (kind === 'optional-value') {
      let argumentExpression = 'inox_undefined_value()'

      if (sourceArgumentIndex < sourceArguments.length) {
        const prepared = dependencies.emitCValueExpression(sourceArguments[sourceArgumentIndex], context)
        pushLines(lines, prepared.lines)
        argumentExpression = prepared.expression
        optionalArgumentPresent = true
      } else {
        optionalArgumentPresent = false
      }

      sourceArgumentIndex = sourceArgumentIndex + 1
      argumentsList.push(argumentExpression)
      continue
    }

    if (kind === 'optional-argument') {
      if (sourceArgumentIndex < sourceArguments.length) {
        const prepared = dependencies.emitCValueExpression(sourceArguments[sourceArgumentIndex], context)
        pushLines(lines, prepared.lines)
        argumentsList.push(prepared.expression)
      }

      sourceArgumentIndex = sourceArgumentIndex + 1
      continue
    }

    if (kind === 'optional-number') {
      if (sourceArgumentIndex < sourceArguments.length) {
        const prepared = dependencies.emitPreparedNumberExpression(sourceArguments[sourceArgumentIndex], context)
        pushLines(lines, prepared.lines)
        argumentsList.push(prepared.expression)
      }

      sourceArgumentIndex = sourceArgumentIndex + 1
      continue
    }

    if (kind === 'string-view-array' || kind === 'optional-string-view-array') {
      let sourceArgument: AnyNode | null = null

      if (sourceArgumentIndex < sourceArguments.length) {
        sourceArgument = sourceArguments[sourceArgumentIndex]
      }

      if (sourceArgument !== null && sourceArgument.type === 'ArrayLiteral') {
        sourceArgumentIndex = sourceArgumentIndex + 1
        const prepared = emitCompilerLibraryStringArray(
          sourceArgument.elements,
          context,
          dependencies,
          lines
        )
        argumentsList.push(prepared.expression)
        stringViewArrayCount = prepared.count
        continue
      }

      if (kind === 'string-view-array') {
        sourceArgumentIndex = sourceArgumentIndex + 1
      }

      argumentsList.push('nullptr')
      stringViewArrayCount = 0
      continue
    }

    if (kind === 'string-view-array-count') {
      argumentsList.push(`${stringViewArrayCount}`)
      continue
    }

    if (kind === 'variadic-string-view-array') {
      const variadicArrayExpression = emitCompilerLibraryVariadicStringArray(
        sourceArguments,
        context,
        dependencies,
        lines
      )
      argumentsList.push(variadicArrayExpression)
      continue
    }

    if (kind === 'variadic-count') {
      argumentsList.push(`${sourceArguments.length}`)
      continue
    }

    if (kind === 'result-shape') {
      const resultShape = emitCompilerLibraryResultShape(item.libraryCResultShapeFields, context)
      pushLines(lines, resultShape.lines)
      argumentsList.push(resultShape.expression)
      continue
    }

    return null
  }

  let callTarget = target

  applyCompilerLibraryArgumentAdapters(argumentsList, item.libraryCArgumentAdapters)
  if (
    receiverCppType === null ||
    typeof receiverCppType === 'undefined' ||
    receiverCppType === 'inox::Value' ||
    receiverCppType === 'inox_value'
  ) {
    receiverExpression = applyCompilerLibraryValueAdapter(receiverExpression, item.libraryCReceiverAdapter)
  }

  if (item.libraryCCallStyle === 'member') {
    if (receiverExpression === '') {
      return null
    }

    callTarget = `${receiverExpression}.${target}`
  }

  let callExpression = `${callTarget}(${joinStrings(argumentsList, ', ')})`

  if (item.libraryCCallStyle === 'index') {
    if (receiverExpression === '' || argumentsList.length !== 1) {
      return null
    }

    callExpression = `${receiverExpression}[${argumentsList[0]}]`
  } else if (item.libraryCCallStyle === 'index-assignment') {
    if (receiverExpression === '' || argumentsList.length !== 2) {
      return null
    }

    callExpression = `(${receiverExpression}[${argumentsList[0]}] = ${argumentsList[1]})`
  } else if (item.libraryCCallStyle === 'member-assignment') {
    if (receiverExpression === '' || argumentsList.length !== 1) {
      return null
    }

    callExpression = `(${receiverExpression}.${target} = ${argumentsList[0]})`
  }

  if (item.valueType === 'promise' && cppType === 'inox::Promise') {
    const promiseValueType = item.promiseValueType ?? 'unknown'
    const rejectionValueType = item.promiseRejectionValueType ?? 'unknown'
    const optionOwned = options?.owned
    const optionOut = options?.out

    if (optionOwned === false && (optionOut === null || typeof optionOut === 'undefined')) {
      return {
        lines,
        expression: callExpression,
        cppType,
        valueType: promiseValueType,
        rejectionValueType
      }
    }

    const out = optionOut ?? nextCName(context, 'inox_library_promise')
    registerEventLoop(context)
    registerOwnedPromise(context, out, promiseValueType, rejectionValueType)
    lines.push(`${out} = ${callExpression};`)
    lines.push(emitRuntimeTypeCheck(`!${out}.valid()`, context))

    return {
      lines,
      expression: out,
      cppType,
      valueType: promiseValueType,
      rejectionValueType
    }
  }

  if (cppType === 'void') {
    lines.push(`${callExpression};`)
    pushCompilerLibraryFailureCheck(lines, item.libraryCFailureMode, '', context, dependencies)
    return {
      lines,
      expression: '',
      valueType: 'void'
    }
  }

  if (
    item.valueType === 'object' &&
    item.libraryCResultShapeFields !== null &&
    typeof item.libraryCResultShapeFields !== 'undefined'
  ) {
    return emitPreparedCompilerLibraryObjectCall(
      expression,
      context,
      dependencies,
      options,
      lines,
      callExpression,
      cppType
    )
  }

  if (item.libraryCFailureMode !== null && typeof item.libraryCFailureMode !== 'undefined') {
    const out = nextCName(context, 'inox_library_result')
    lines.push(`auto ${out} = ${callExpression};`)
    pushCompilerLibraryFailureCheck(lines, item.libraryCFailureMode, out, context, dependencies)

    return {
      lines,
      expression: out,
      cppType,
      nullable: item.nullable === true,
      owned: item.libraryOwned === true,
      runtimeTypeChecked: cppType !== 'inox::Value',
      valueType: item.valueType ?? undefined
    }
  }

  return {
    lines,
    expression: callExpression,
    cppType: declaredCppType ?? undefined,
    scalarType,
    nullable: item.nullable === true,
    runtimeTypeChecked: cppType !== 'inox::Value',
    valueType: item.valueType ?? undefined,
    owned: item.libraryOwned === true
  }
}

function emitPreparedCompilerLibraryIntrinsicExpression(
  expression: AnyNode,
  item: CompilerLibraryExpressionNode,
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies
): PreparedExpression | null {
  if (expression.type !== 'CallExpression' || expression.args.length !== 1) {
    return null
  }

  const argument = expression.args[0]

  if (item.libraryCLowering === 'string-conversion') {
    return dependencies.emitPreparedStringConversionExpression(argument, context)
  }

  if (item.libraryCLowering === 'number-from-string') {
    return dependencies.emitPreparedNumberFromStringExpression(argument, context)
  }

  return null
}

function compilerLibraryScalarType(valueType: string | null | undefined): string | undefined {
  if (valueType === 'number') {
    return 'double'
  }

  if (valueType === 'boolean') {
    return 'bool'
  }

  if (valueType === 'void') {
    return 'void'
  }

  return undefined
}

export function compilerLibraryRuntimeCallbackArgumentInfo(
  expression: AnyNode
): { functionType: CFunctionType; index: number } | null {
  if (expression.type !== 'CallExpression' && expression.type !== 'NewExpression') {
    return null
  }

  const item = expression as CompilerLibraryExpressionNode
  const argumentKinds = item.libraryCArgumentKinds
  const argumentSources = item.libraryCArgumentSources

  if (argumentKinds === null || typeof argumentKinds === 'undefined') {
    return null
  }

  let sourceArgumentIndex = 0

  for (let kindIndex = 0; kindIndex < argumentKinds.length; kindIndex = kindIndex + 1) {
    const kind = argumentKinds[kindIndex]
    let argumentSource: CompilerLibraryCArgumentSource | null = null

    if (
      argumentSources !== null &&
      typeof argumentSources !== 'undefined' &&
      kindIndex < argumentSources.length
    ) {
      argumentSource = argumentSources[kindIndex]
    }

    if (kind === 'runtime-callback' || kind === 'optional-runtime-callback') {
      const index = argumentSource?.argumentIndex ?? sourceArgumentIndex
      const callback = expression.args[index]
      const functionType = callback?.functionType

      if (functionType !== null && typeof functionType !== 'undefined') {
        return { functionType: functionType as CFunctionType, index }
      }

      return null
    }

    if (compilerLibraryCArgumentKindConsumesSource(kind, argumentSource)) {
      sourceArgumentIndex = sourceArgumentIndex + 1
    }
  }

  return null
}

export function isCompilerLibraryExternalEventLoopCallExpression(
  expression: AnyNode | null | undefined
): boolean {
  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    (expression.type === 'CallExpression' || expression.type === 'NewExpression') &&
    expression.libraryCallbackLifetime === 'event-loop'
  )
}

function compilerLibraryCArgumentKindConsumesSource(
  kind: string,
  source: CompilerLibraryCArgumentSource | null
): boolean {
  if (source !== null) {
    return false
  }

  return (
    kind === 'string-view' ||
    kind === 'optional-string-view' ||
    kind === 'string-view-or-value' ||
    kind === 'value' ||
    kind === 'number' ||
    kind === 'optional-value' ||
    kind === 'optional-argument' ||
    kind === 'optional-number' ||
    kind === 'string-view-array' ||
    kind === 'optional-string-view-array'
  )
}

export function isCompilerLibraryPromiseExpression(expression: AnyNode | null | undefined): boolean {
  return (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'CallExpression' &&
    expression.valueType === 'promise' &&
    expression.libraryOperationId !== null &&
    typeof expression.libraryOperationId !== 'undefined'
  )
}

function compilerLibraryObjectBooleanLiteral(
  argument: AnyNode | null | undefined,
  fieldName: string
): boolean {
  if (argument === null || typeof argument === 'undefined' || argument.type !== 'ObjectLiteral') {
    return false
  }

  for (let index = 0; index < argument.properties.length; index = index + 1) {
    const property = argument.properties[index]

    if (property.key === fieldName && property.value.type === 'BooleanLiteral') {
      return property.value.value === true
    }
  }

  return false
}

function compilerLibraryObjectField(
  argument: AnyNode | null | undefined,
  fieldName: string
): AnyNode | null {
  if (argument === null || typeof argument === 'undefined' || argument.type !== 'ObjectLiteral') {
    return null
  }

  for (let index = 0; index < argument.properties.length; index = index + 1) {
    const property = argument.properties[index]

    if (property.key === fieldName) {
      return property.value
    }
  }

  return null
}

function applyCompilerLibraryValueAdapter(value: string, adapter: string | null | undefined): string {
  if (value === '' || adapter === null || typeof adapter === 'undefined' || adapter === '') {
    return value
  }

  return adapter.split('$value').join(value)
}

function emitPreparedCompilerLibraryObjectCall(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies,
  options: PreparedCallOptions | null | undefined,
  lines: string[],
  callExpression: string,
  cppType: string
): PreparedExpression {
  let out = nextCName(context, 'inox_library_object')

  if (
    options !== null &&
    typeof options !== 'undefined' &&
    options.out !== null &&
    typeof options.out !== 'undefined'
  ) {
    out = options.out
  }

  if ((expression as CompilerLibraryExpressionNode).libraryCResultMode === 'borrowed') {
    lines.push(`auto& ${out} = ${callExpression};`)
    context.variables.set(out, 'object')
    context.cppValueTypes.set(out, cppType)
    dependencies.registerObjectShape(context, out, expression.shape)
    pushCompilerLibraryFailureCheck(
      lines,
      (expression as CompilerLibraryExpressionNode).libraryCFailureMode,
      out,
      context,
      dependencies
    )

    return {
      lines,
      expression: out,
      cppType,
      valueType: 'object'
    }
  }

  if (cppType === 'inox::Value') {
    pushLines(lines, emitPrepareOwnedValueWrite(out))
  } else {
    lines.push(`auto ${out} = ${callExpression};`)
  }

  if (
    cppType === 'inox::Value' &&
    (options === null || typeof options === 'undefined' || options.owned !== false)
  ) {
    registerOwnedValue(context, out)
  }

  context.variables.set(out, 'object')
  context.cppValueTypes.set(out, cppType)
  dependencies.registerObjectShape(context, out, expression.shape)

  if (cppType === 'inox::Value') {
    lines.push(`${out} = ${callExpression};`)
  }

  pushCompilerLibraryFailureCheck(
    lines,
    (expression as CompilerLibraryExpressionNode).libraryCFailureMode,
    out,
    context,
    dependencies
  )

  return {
    lines,
    expression: out,
    cppType,
    valueType: 'object'
  }
}

function applyCompilerLibraryArgumentAdapters(
  argumentsList: string[],
  adapters: string[] | null | undefined
): void {
  if (adapters === null || typeof adapters === 'undefined') {
    return
  }

  for (let index = 0; index < argumentsList.length && index < adapters.length; index = index + 1) {
    const adapter = adapters[index]

    if (adapter.length > 0) {
      argumentsList[index] = adapter.split('$value').join(argumentsList[index])
    }
  }
}

function emitCompilerLibraryStringArray(
  sourceArguments: AnyNode[],
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies,
  lines: string[]
): { expression: string; count: number } {
  if (sourceArguments.length === 0) {
    return { expression: 'nullptr', count: 0 }
  }

  return {
    expression: emitCompilerLibraryVariadicStringArray(sourceArguments, context, dependencies, lines),
    count: sourceArguments.length
  }
}

function emitCompilerLibraryVariadicStringArray(
  sourceArguments: AnyNode[],
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies,
  lines: string[]
): string {
  if (sourceArguments.length === 0) {
    return 'nullptr'
  }

  const values: string[] = []

  for (let index = 0; index < sourceArguments.length; index = index + 1) {
    const prepared = dependencies.emitPreparedStringBytesOperand(
      sourceArguments[index],
      context,
      'inox_library_arg'
    )
    pushLines(lines, prepared.lines)
    values.push(emitCompilerLibraryStringArgument(prepared))
  }

  const name = nextCName(context, 'inox_library_args')
  lines.push(`const inox::StringView ${name}[] = { ${joinStrings(values, ', ')} };`)
  return name
}

function compilerLibrarySourceArguments(expression: AnyNode): AnyNode[] {
  if (expression.type === 'AssignmentExpression') {
    if (expression.target.type === 'IndexExpression') {
      return [expression.target.index, expression.value]
    }

    return [expression.value]
  }

  if (expression.type === 'IndexExpression') {
    return [expression.index]
  }

  if (expression.type === 'MemberExpression') {
    return []
  }

  return expression.args
}

function compilerLibraryReceiver(expression: AnyNode): AnyNode | null {
  if (expression.type === 'AssignmentExpression') {
    if (expression.target.type === 'MemberExpression') {
      return expression.target.object
    }

    if (expression.target.type === 'IndexExpression') {
      return expression.target.object
    }

    return null
  }

  if (expression.type === 'IndexExpression' || expression.type === 'MemberExpression') {
    return expression.object
  }

  if (expression.type === 'CallExpression' && expression.callee.type === 'MemberExpression') {
    return expression.callee.object
  }

  return null
}

function compilerLibraryMemberName(expression: AnyNode): string | null {
  if (expression.type === 'MemberExpression') {
    return expression.property
  }

  if (expression.type === 'AssignmentExpression' && expression.target.type === 'MemberExpression') {
    return expression.target.property
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return expression.index.value
  }

  return null
}

function compilerLibraryDynamicMemberExpression(expression: AnyNode): AnyNode | null {
  if (expression.type === 'IndexExpression') {
    return expression.index
  }

  return null
}

function pushCompilerLibraryFailureCheck(
  lines: string[],
  mode: string | null | undefined,
  result: string,
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies
): void {
  if (mode === 'thrown') {
    pushLines(lines, dependencies.emitThrownCheckLines(context))
  } else if (mode === 'invalid-result' && result !== '') {
    lines.push(emitRuntimeTypeCheck(`!${result}.valid()`, context))
  }
}

function emitCompilerLibraryResultShape(
  fields: string[] | null | undefined,
  context: CFunctionContext
): PreparedExpression {
  if (fields === null || typeof fields === 'undefined') {
    return {
      lines: [],
      expression: 'nullptr'
    }
  }

  const shapeName = nextCName(context, 'inox_shape_library_result')
  const fieldsName = `${shapeName}_fields`
  const lines = [`static const inox_field_info ${fieldsName}[] = {`]

  for (let index = 0; index < fields.length; index = index + 1) {
    lines.push(`  { ${cStringLiteral(fields[index])}, INOX_FIELD_READONLY },`)
  }

  lines.push('};')
  lines.push(`static const inox_shape ${shapeName} = {`)
  lines.push(`  ${fields.length},`)
  lines.push(`  ${fieldsName}`)
  lines.push('};')

  return {
    lines,
    expression: `&${shapeName}`
  }
}

function emitCompilerLibraryStringArgument(operand: PreparedStringBytesOperand): string {
  return operand.cppExpression ?? `inox::StringView(${operand.bytes}, ${operand.length})`
}

function pushLines(target: string[], source: string[]): void {
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

export function compilerLibraryStringConstantValue(expression: AnyNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  const item = expression as CompilerLibraryExpressionNode
  const value = item.libraryConstantValue

  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

export function isCompilerLibraryStringExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  const item = expression as CompilerLibraryExpressionNode

  return item.libraryCppType === 'inox::String'
}
