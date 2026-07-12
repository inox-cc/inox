import type { AnyNode } from '../types.ts'
import { emitPrepareOwnedValueWrite, emitRuntimeTypeCheck, nextCName, registerOwnedValue } from './context.ts'
import type { CFunctionContext } from './context.ts'
import { cStringLiteral } from './identifiers.ts'
import type {
  CObjectShape,
  CObjectShapeField,
  CPreparedCallOptions as PreparedCallOptions,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand
} from './types.ts'

type CompilerLibraryExpressionNode = AnyNode & {
  libraryCExpression?: string | null
  libraryCArgumentKinds?: string[] | null
  libraryCResultShapeFields?: string[] | null
  libraryCCallStyle?: string | null
  libraryCFailureMode?: string | null
  libraryConstantValue?: string | null
  libraryCppType?: string | null
  libraryOwned?: boolean | null
}

export type CompilerLibraryLoweringDependencies = {
  emitCValueExpression(expression: AnyNode, context: CFunctionContext): PreparedExpression
  emitPreparedStringBytesOperand(
    expression: AnyNode,
    context: CFunctionContext,
    tempPrefix?: string
  ): PreparedStringBytesOperand
  registerObjectShape(context: CFunctionContext, name: string, shape: CObjectShape | null | undefined): void
}

export function emitPreparedCompilerLibraryExpression(expression: AnyNode): PreparedExpression | null {
  const item = expression as CompilerLibraryExpressionNode
  const cExpression = item.libraryCExpression
  const cppType = item.libraryCppType
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

export function emitPreparedCompilerLibraryCallExpression(
  expression: AnyNode,
  context: CFunctionContext,
  dependencies: CompilerLibraryLoweringDependencies,
  options?: PreparedCallOptions | null
): PreparedExpression | null {
  const item = expression as CompilerLibraryExpressionNode
  const target = item.libraryCExpression
  const argumentKinds = item.libraryCArgumentKinds
  const cppType = item.libraryCppType

  if (
    (expression.type !== 'CallExpression' &&
      expression.type !== 'NewExpression' &&
      expression.type !== 'AssignmentExpression') ||
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
  const sourceArguments = compilerLibrarySourceArguments(expression)

  for (let kindIndex = 0; kindIndex < argumentKinds.length; kindIndex = kindIndex + 1) {
    const kind = argumentKinds[kindIndex]

    if (kind === 'receiver') {
      const receiver = compilerLibraryReceiver(expression)

      if (receiver === null) {
        return null
      }

      const prepared = dependencies.emitCValueExpression(receiver, context)
      pushLines(lines, prepared.lines)
      receiverExpression = prepared.expression
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

    if (kind === 'argument-presence') {
      argumentsList.push(optionalArgumentPresent ? 'true' : 'false')
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

  if (item.libraryCCallStyle === 'member') {
    if (receiverExpression === '') {
      return null
    }

    callTarget = `${receiverExpression}.${target}`
  }

  const callExpression = `${callTarget}(${joinStrings(argumentsList, ', ')})`

  if (cppType === 'void') {
    lines.push(`${callExpression};`)
    pushCompilerLibraryFailureCheck(lines, item.libraryCFailureMode, '', context)
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
    pushCompilerLibraryFailureCheck(lines, item.libraryCFailureMode, out, context)

    return {
      lines,
      expression: out,
      cppType,
      nullable: item.nullable === true,
      owned: item.libraryOwned === true,
      valueType: item.valueType ?? undefined
    }
  }

  return {
    lines,
    expression: callExpression,
    cppType,
    nullable: item.nullable === true,
    valueType: item.valueType ?? undefined,
    owned: item.libraryOwned === true
  }
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
    context
  )

  return {
    lines,
    expression: out,
    cppType
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
    return [expression.value]
  }

  return expression.args
}

function compilerLibraryReceiver(expression: AnyNode): AnyNode | null {
  if (expression.type === 'AssignmentExpression') {
    if (expression.target.type === 'MemberExpression') {
      return expression.target.object
    }

    return null
  }

  if (expression.type === 'CallExpression' && expression.callee.type === 'MemberExpression') {
    return expression.callee.object
  }

  return null
}

function pushCompilerLibraryFailureCheck(
  lines: string[],
  mode: string | null | undefined,
  result: string,
  context: CFunctionContext
): void {
  if (mode === 'thrown') {
    lines.push(emitRuntimeTypeCheck('inox::thrown()', context))
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
