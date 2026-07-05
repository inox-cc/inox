import { diagnostic } from '../../diagnostics.ts'
import { tokenize } from '../../lexer.ts'
import { memberExpressionPath } from '../../member-paths.ts'
import { parse } from '../../parser.ts'
import { nullableTypeNameFromTypeName } from '../../type-names.ts'
import {
  isStringIndexMethod,
  isStringPredicateMethod,
  isStringRuntimeMethod,
  stringRuntimeReturnType
} from '../../../stdlib/global/compiler/descriptor.ts'
import type { AnyNode, Diagnostic, SourceLocation } from '../../types.ts'
import {
  emitFailureStatement,
  emitPrepareOwnedValueWrite,
  emitRuntimeTypeCheck,
  emitStatusCheck,
  nextCName,
  pushDiagnostic,
  registerOwnedValue
} from '../context.ts'
import { isCJsGlobalRoot } from '../globals.ts'
import { cStringLiteral, emitCIdentifier, escapeCPrintfFormatText, utf8ByteLength } from '../identifiers.ts'
import { emitRuntimeValueCheck } from '../runtime-values.ts'
import { cUnsupportedExpressionCode, isCoalesceExpression, isOptionalChainExpression } from '../syntax.ts'
import type {
  CObjectFieldInfo,
  CPreparedExpression as PreparedExpression,
  CPreparedStringBytesOperand as PreparedStringBytesOperand,
  CRuntimeArrayElement
} from '../types.ts'
import { isManagedRuntimeReturnType, isNullableScalarType, isOpaqueRuntimeValueType } from '../value-types.ts'
import { emitSliceIndexNormalizationLines } from './slices.ts'

type StringDiagnosticContext = {
  diagnostics: Diagnostic[]
}

type StringCContext = {
  cleanupEnabled: boolean
  cppStringValues?: Set<string>
  diagnostics?: Diagnostic[]
  errorChannelUsed?: boolean
  errorTargetActiveFlags?: boolean[]
  errorTargets?: string[]
  failureStatement?: string | null
  failureStatementUsed?: boolean
  functionNames?: Map<string, string>
  jsGlobalRoots?: Set<string>
  localValueNames?: Set<string>
  moduleValueNames?: Map<string, string>
  moduleValueTypes?: Map<string, string>
  nullableVariables?: Set<string>
  narrowedNullableScalars?: Set<string>
  nextId: number
  ownedValues: string[]
  returnType?: string
  runtimeStringValues?: Map<string, string>
  runtimeStrings?: Set<string>
  statusReturn: boolean
  stringLoweringDependencies?: StringLoweringDependencies
  throwingFunction: boolean
  usedCleanupGoto: boolean
  variables?: Map<string, string>
  [key: string]: any
}

type TemplateLiteralPart = {
  kind: string
  value: string
  loc?: SourceLocation
}

type TokenizeLocationOptions = {
  file?: string
}

type PreparedStringSplitExpression = PreparedExpression & {
  elementType: string
}

export type PreparedStringFormat = {
  lines: string[]
  format: string
  values: string[]
}

type TrimmedTemplatePlaceholder = {
  value: string
  loc: SourceLocation
}

type CompileErrorLike = {
  diagnostics: Diagnostic[]
}

type CompileErrorCandidate = {
  diagnostics?: Diagnostic[]
}

type RuntimeObjectFieldAccess = {
  key: string
  object: AnyNode
}

type TemplateLocationState = {
  line: number
  column: number
}

type TemplateReferenceValidationState = {
  context: StringCContext
  reported: Set<string>
  valid: boolean
}

type StringMethodNode = {
  args?: StringMethodNode[]
  argsOwnership?: 'weak'
  callee?: StringMethodNode
  calleeOwnership?: 'weak'
  index?: StringMethodNode
  indexOwnership?: 'weak'
  loc?: SourceLocation | null
  object?: StringMethodNode
  objectOwnership?: 'weak'
  path?: string[]
  property?: string
  type?: string
  valueType?: string | null
}

type StringIndexNode = StringMethodNode & {
  object?: StringMethodNode
  index?: StringMethodNode
}

type StringCallNode = StringMethodNode & {
  args?: StringMethodNode[]
  callee?: StringMethodNode
}

type StringMethodCallParts = {
  args: StringMethodNode[]
  object: StringMethodNode
}

function stringNodeAt(values: StringMethodNode[], index: number): StringMethodNode {
  return values[index]
}

function stringPathAt(values: string[], index: number): string {
  return values[index]
}

export type StringLoweringDependencies = {
  canLowerCNullishCoalescingExpression(expression: AnyNode, context: StringCContext): boolean
  emitCallExpression(expression: AnyNode, context: StringCContext): string
  emitCValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression
  emitObjectValueReference(name: string, context: StringCContext): string
  emitPreparedObjectExpressionIndexValueExpression(
    expression: AnyNode,
    context: StringCContext
  ): PreparedExpression | null
  emitPreparedObjectExpressionMemberValueExpression(
    expression: AnyNode,
    context: StringCContext
  ): PreparedExpression | null
  emitPreparedNumberExpression(expression: AnyNode, context: StringCContext): PreparedExpression
  emitPreparedNativeClassStringFieldExpression(expression: AnyNode, context: StringCContext): PreparedExpression | null
  emitPreparedRuntimeArrayIndexValue(
    expression: AnyNode,
    element: CRuntimeArrayElement,
    context: StringCContext,
    tempPrefix: string
  ): PreparedExpression
  emitPreparedClassToStringExpression(expression: AnyNode, context: StringCContext): PreparedExpression | null
  emitPreparedRuntimeObjectReferenceExpression(
    expression: AnyNode,
    context: StringCContext
  ): PreparedExpression | null
  emitPreparedRuntimeObjectRootReferenceExpression(
    name: string,
    context: StringCContext
  ): PreparedExpression | null
  emitReference(expression: AnyNode, context: StringCContext): string
  inferExpressionType(expression: AnyNode, context: StringCContext): string
  hasClassToStringExpression(expression: AnyNode, context: StringCContext): boolean
  isBoxedRuntimeStringName(name: string, context: StringCContext): boolean
  isBoxedRuntimeStringReference(expression: AnyNode, context: StringCContext): boolean
  isMemberAccessExpression(expression: AnyNode): boolean
  isNodeRuntimeProducedStringExpression(expression: AnyNode | null | undefined): boolean
  nodeRuntimeStringConstantValue(expression: AnyNode | null | undefined): string | null
  resolveKnownObjectIndex(expression: AnyNode, context: StringCContext): CObjectFieldInfo | null
  resolveKnownObjectMember(expression: AnyNode, context: StringCContext): CObjectFieldInfo | null
  resolveNodeNetworkAddressStringMember(expression: AnyNode, context: StringCContext): string | null
  resolveRuntimeArrayIndex(expression: AnyNode, context: StringCContext): CRuntimeArrayElement | null
}

const unconfiguredStringLoweringDependencies = {} as StringLoweringDependencies

function stringDeps(context: StringCContext): StringLoweringDependencies {
  const deps = context.stringLoweringDependencies

  if (deps !== null && typeof deps !== 'undefined') {
    return deps
  }

  return unconfiguredStringLoweringDependencies
}

function pushStringDiagnostic(context: StringCContext | StringDiagnosticContext, item: Diagnostic): void {
  pushDiagnostic(context as unknown as StringDiagnosticContext, item)
}

function pushAllLines(target: string[], source: string[]): void {
  for (const line of source) {
    target.push(line)
  }
}

function currentStringErrorTarget(context: StringCContext): string {
  const targets = context.errorTargets

  if (targets === null || typeof targets === 'undefined' || targets.length === 0) {
    return ''
  }

  return targets[targets.length - 1]
}

function currentStringErrorTargetRequiresActive(context: StringCContext): boolean {
  const flags = context.errorTargetActiveFlags

  if (flags === null || typeof flags === 'undefined' || flags.length === 0) {
    return false
  }

  return flags[flags.length - 1]
}

function registerStringErrorValue(context: StringCContext): void {
  registerOwnedValue(context, 'inox_error')
}

function registerStringErrorChannel(context: StringCContext): void {
  context.errorChannelUsed = true
  registerStringErrorValue(context)
}

function emitStringThrownCheckLines(context: StringCContext): string[] {
  const target = currentStringErrorTarget(context)

  if (target === '' && !context.throwingFunction) {
    return [`if (inox::thrown()) ${emitFailureStatement(context)}`]
  }

  const errorActiveNeeded = currentStringErrorTargetRequiresActive(context) || (target === '' && context.throwingFunction)

  if (errorActiveNeeded) {
    registerStringErrorChannel(context)
  } else if (target === '') {
    registerStringErrorValue(context)
  }

  if (target !== '' && !errorActiveNeeded) {
    return [`if (inox::thrown()) goto ${target};`]
  }

  const lines: string[] = ['if (inox::thrown()) {']

  if (target === '') {
    lines.push('  inox_error = inox::take_exception();')
  }
  if (errorActiveNeeded) {
    lines.push('  inox_error_active = 1;')
  }
  if (target === '') {
    lines.push('  inox_status_result = INOX_ERR_THROW;')
    lines.push('  goto cleanup;')
  } else {
    lines.push(`  goto ${target};`)
  }

  lines.push('}')

  return lines
}

function emitStringObjectGetValueLines(
  object: string,
  key: string,
  value: string,
  context: StringCContext
): string[] {
  const lines = [`${value} = inox::get(${object}, ${cStringLiteral(key)});`]

  pushAllLines(lines, emitStringThrownCheckLines(context))

  return lines
}

function sourceLocationWithFile(loc: SourceLocation | undefined, line: number, column: number): SourceLocation {
  const result: SourceLocation = {
    line,
    column
  }

  if (loc !== null && typeof loc !== 'undefined') {
    const file = loc.file

    if (file !== null && typeof file !== 'undefined') {
      result.file = file
    }
  }

  return result
}

function tokenizeLocationOptions(loc: SourceLocation | undefined): TokenizeLocationOptions {
  const options: TokenizeLocationOptions = {}

  if (loc !== null && typeof loc !== 'undefined') {
    const file = loc.file

    if (file !== null && typeof file !== 'undefined') {
      options.file = file
    }
  }

  return options
}

function nodeLocation(node: AnyNode | null | undefined): SourceLocation | null | undefined {
  if (node !== null && typeof node !== 'undefined') {
    return node.loc
  }

  return null
}

function compileErrorOrNull(error: unknown): CompileErrorLike | null {
  const candidate = error as CompileErrorCandidate

  if (candidate !== null && typeof candidate !== 'undefined' && Array.isArray(candidate.diagnostics)) {
    return {
      diagnostics: candidate.diagnostics
    }
  }

  return null
}

export function resolveRuntimeStringReference(
  expression: AnyNode | null | undefined,
  context: StringCContext
): string | null {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return null
  }

  const name = expression.path[0]
  const runtimeStrings = context.runtimeStrings

  if (runtimeStrings !== null && typeof runtimeStrings !== 'undefined' && runtimeStrings.has(name)) {
    return name
  }

  return null
}

export function emitStringExpression(expression: AnyNode | null | undefined, context: StringCContext): string {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'StringLiteral') {
    return JSON.stringify(expression.value)
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'TemplateLiteral' &&
    !expression.raw.includes('${')
  ) {
    return JSON.stringify(cookTemplateLiteralText(expression.raw.slice(1, -1)))
  }

  const runtimeConstant = runtimeStringConstantValue(expression, context)

  if (runtimeConstant !== null && typeof runtimeConstant !== 'undefined') {
    return JSON.stringify(runtimeConstant)
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'Reference') {
    return stringDeps(context).emitReference(expression, context)
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'CallExpression') {
    return stringDeps(context).emitCallExpression(expression, context)
  }

  if (expression !== null && typeof expression !== 'undefined' && isCoalesceExpression(expression)) {
    pushStringDiagnostic(
      context,
      diagnostic('INOX_C_NULLISH', 'nullish coalescing is not supported by the current C backend slice', expression.loc)
    )
    return '""'
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    stringDeps(context).isMemberAccessExpression(expression)
  ) {
    const member = stringDeps(context).resolveKnownObjectMember(expression, context)

    if (member !== null && typeof member !== 'undefined' && isNullableScalarType(member.valueType)) {
      pushStringDiagnostic(
        context,
        diagnostic(
          'INOX_C_UNSUPPORTED_EXPR',
          'object field access must be assigned before it can be used by the current C backend slice',
          expression.loc
        )
      )
      return '""'
    }
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'AwaitExpression') {
    pushStringDiagnostic(
      context,
      diagnostic(
        'INOX_C_ASYNC',
        'async/await is not supported by the current C backend slice',
        nodeLocation(expression)
      )
    )
    return '""'
  }

  if (expression !== null && typeof expression !== 'undefined' && isOptionalChainExpression(expression)) {
    pushStringDiagnostic(
      context,
      diagnostic(
        'INOX_C_OPTIONAL_CHAINING',
        'optional chaining is not supported by the current C backend slice',
        nodeLocation(expression)
      )
    )
    return '""'
  }

  pushStringDiagnostic(
    context,
    diagnostic(
      'INOX_C_STRING_EXPR',
      'this string expression is not supported by the current C backend slice',
      nodeLocation(expression)
    )
  )
  return '""'
}

function runtimeStringConstantValue(expression: AnyNode | null | undefined, context: StringCContext): string | null {
  return stringDeps(context).nodeRuntimeStringConstantValue(expression)
}

export function emitPreparedStringLengthExpression(
  expression: AnyNode | null | undefined,
  context: StringCContext
): PreparedExpression | null {
  const object = stringLengthObjectExpression(expression)

  if (object === null || typeof object === 'undefined' || !isStringLengthObject(object, context)) {
    return null
  }

  if (
    isDynamicRuntimeStringFieldExpression(object, context) &&
    !stringDeps(context).isNodeRuntimeProducedStringExpression(object)
  ) {
    return null
  }

  const operand = emitPreparedStringBytesOperand(object, context, 'inox_length_string')
  const length = nextCName(context, 'inox_string_length')
  const lines: string[] = []

  pushAllLines(lines, operand.lines)
  lines.push(`size_t ${length} = inox_string_code_unit_length_parts(${operand.bytes}, ${operand.length});`)

  return {
    lines,
    expression: `((double)${length})`
  }
}

function stringLengthObjectExpression(expression: AnyNode | null | undefined): AnyNode | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'MemberExpression' && expression.property === 'length') {
    return expression.object
  }

  if (expression.type === 'Reference' && expression.path.length > 1) {
    const last = stringPathAt(expression.path, expression.path.length - 1)

    if (last === 'length') {
      return referencePathObjectExpression(expression)
    }
  }

  return null
}

export function emitPreparedStringCompareExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const runtimeLiteralCompare = emitPreparedRuntimeStringLiteralCompareExpression(expression, context)

  if (runtimeLiteralCompare !== null && typeof runtimeLiteralCompare !== 'undefined') {
    return runtimeLiteralCompare
  }

  const left = emitPreparedStringBytesOperand(expression.left, context, 'inox_cmp_string')
  const right = emitPreparedStringBytesOperand(expression.right, context, 'inox_cmp_string')
  const equals = `(${left.length} == ${right.length} && memcmp(${left.bytes}, ${right.bytes}, ${left.length}) == 0)`
  const lines: string[] = []
  let resultExpression = `(!${equals})`

  pushAllLines(lines, left.lines)
  pushAllLines(lines, right.lines)

  if (expression.operator === '===') {
    resultExpression = equals
  }

  return {
    lines,
    expression: resultExpression
  }
}

function emitPreparedRuntimeStringLiteralCompareExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedExpression | null {
  if (expression.operator !== '===' && expression.operator !== '!==') {
    return null
  }

  if (expression.left.type === 'StringLiteral') {
    return emitPreparedRuntimeValueStringLiteralCompare(expression.right, expression.left.value, expression.operator, context)
  }

  if (expression.right.type === 'StringLiteral') {
    return emitPreparedRuntimeValueStringLiteralCompare(expression.left, expression.right.value, expression.operator, context)
  }

  return null
}

function emitPreparedRuntimeValueStringLiteralCompare(
  expression: AnyNode,
  literal: string,
  operator: string,
  context: StringCContext
): PreparedExpression | null {
  if (!isRuntimeObjectStringFieldExpression(expression, context)) {
    return null
  }

  const value = stringDeps(context).emitCValueExpression(expression, context)
  const temp = nextCName(context, 'inox_string_cmp_value')
  const literalLength = utf8ByteLength(literal)
  const string = `((inox_string*)${temp}.as.ref)`
  const equals =
    `(${temp}.tag == INOX_TAG_STRING && ${temp}.as.ref != 0 && ` +
    `${string}->len == ${literalLength} && memcmp(${string}->bytes, ${cStringLiteral(literal)}, ${literalLength}) == 0)`
  const lines: string[] = []
  let resultExpression = `(!${equals})`

  pushAllLines(lines, value.lines)
  lines.push(`inox_value ${temp} = ${value.expression};`)

  if (operator === '===') {
    resultExpression = equals
  }

  return {
    lines,
    expression: resultExpression
  }
}

function isRuntimeObjectStringFieldExpression(expression: AnyNode, context: StringCContext): boolean {
  const object = dynamicRuntimeObjectFieldObject(expression)

  if (object === null || typeof object === 'undefined') {
    return false
  }

  if (knownObjectStringField(expression, context)) {
    return true
  }

  if (isKnownOptionalObjectStringField(expression, context)) {
    return true
  }

  return isDynamicRuntimeStringFieldExpression(expression, context)
}

export function canEmitStringBytesOperand(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'StringLiteral' || expression.type === 'TemplateLiteral') {
    return true
  }

  if (runtimeStringConstantValue(expression, context) !== null) {
    return true
  }

  if (stringDeps(context).isNodeRuntimeProducedStringExpression(expression)) {
    return true
  }

  if (nodeValueType(expression) === 'string') {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    if (isModuleRuntimeStringReference(expression, context)) {
      return true
    }

    const variables = context.variables
    const runtimeStrings = context.runtimeStrings
    const name = expression.path[0]
    let valueType = nodeValueType(expression)

    if (variables !== null && typeof variables !== 'undefined') {
      const variableType = variables.get(name)

      if (variableType !== null && typeof variableType !== 'undefined') {
        valueType = variableType
      }
    }

    if (
      valueType === 'string' ||
      (runtimeStrings !== null && typeof runtimeStrings !== 'undefined' && runtimeStrings.has(name))
    ) {
      return true
    }
  }

  if (stringDeps(context).resolveNodeNetworkAddressStringMember(expression, context)) {
    return true
  }

  if (knownObjectStringField(expression, context)) {
    return true
  }

  if (isKnownOptionalObjectStringField(expression, context)) {
    return true
  }

  if (isDynamicRuntimeStringFieldExpression(expression, context)) {
    return true
  }

  if (isRuntimeObjectStringFieldCandidate(expression, context)) {
    return true
  }

  if (isStringIndexExpression(expression, context)) {
    return true
  }

  if (isStringValueCallExpression(expression, context)) {
    return true
  }

  return stringDeps(context).inferExpressionType(expression, context) === 'string'
}

export function emitPreparedStringPredicateCall(expression: AnyNode, context: StringCContext): PreparedExpression {
  const cppValue = emitPreparedCppStringExpression(expression.callee.object, context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    const search = emitPreparedCppStringArgument(expression.args[0], context, 'inox_string_method_search')
    const lines: string[] = []

    pushAllLines(lines, cppValue.lines)

    if (search !== null && typeof search !== 'undefined') {
      pushAllLines(lines, search.lines)

      if (expression.callee.property === 'includes' && expression.args.length > 1) {
        const position = stringDeps(context).emitPreparedNumberExpression(expression.args[1], context)

        pushAllLines(lines, position.lines)

        return {
          lines,
          expression: `(${cppValue.expression}.includes(${search.expression}, ${position.expression}) ? 1 : 0)`
        }
      }

      return {
        lines,
        expression: `(${cppValue.expression}.${expression.callee.property}(${search.expression}) ? 1 : 0)`
      }
    }
  }

  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'inox_string_method_value')
  const search = emitPreparedStringBytesOperand(expression.args[0], context, 'inox_string_method_search')
  const helper = cStringPredicateHelperName(expression.callee.property)
  const lines: string[] = []
  let helperCall = `${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length})`

  pushAllLines(lines, value.lines)
  pushAllLines(lines, search.lines)

  if (expression.callee.property === 'includes' && expression.args.length > 1) {
    const positionArgument = expression.args[1]
    const position = stringDeps(context).emitPreparedNumberExpression(positionArgument, context)
    const positionRaw = nextCName(context, 'inox_string_includes_position_raw')
    const positionIndex = nextCName(context, 'inox_string_includes_position')

    pushAllLines(lines, position.lines)
    lines.push(`double ${positionRaw} = ${position.expression};`)
    pushAllLines(lines, emitNonNegativeStringPositionLines(positionRaw, positionIndex))
    helperCall = `inox_string_includes_from_parts(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}, ${positionIndex})`
  }

  return {
    lines,
    expression: `(${helperCall} ? 1 : 0)`
  }
}

export function emitPreparedStringCharCodeAtExpression(
  expression: any,
  context: StringCContext
): PreparedExpression | null {
  if (!isNodeCandidate(expression) || expression.type !== 'CallExpression') {
    return null
  }

  const call = resolveStringMethodCallParts(expression, 'charCodeAt')

  if (call === null || typeof call === 'undefined') {
    return null
  }

  const object = call.object
  const args = call.args

  if (!isNodeCandidate(object) || args.length !== 1 || !isNodeCandidate(args[0])) {
    return null
  }

  const indexArgument = args[0]

  if (stringDeps(context).inferExpressionType(indexArgument, context) !== 'number') {
    return null
  }

  const value = emitPreparedStringBytesOperand(object, context, 'inox_string_char_code_value')
  const index = stringDeps(context).emitPreparedNumberExpression(indexArgument, context)
  const offset = nextCName(context, 'inox_string_char_code_index')
  const lines: string[] = []

  pushAllLines(lines, value.lines)
  pushAllLines(lines, index.lines)
  lines.push(`size_t ${offset} = (size_t)(${index.expression});`)

  return {
    lines,
    expression: `inox_string_char_code_at_parts(${value.bytes}, ${value.length}, ${offset})`
  }
}

export function emitPreparedStringIndexCallExpression(
  expression: any,
  context: StringCContext
): PreparedExpression | null {
  if (!isNodeCandidate(expression) || expression.type !== 'CallExpression') {
    return null
  }

  const method = stringIndexMethodName(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  const call = resolveStringMethodCallParts(expression, method)

  if (call === null || typeof call === 'undefined') {
    return null
  }

  const object = call.object
  const args = call.args

  const searchArgument = stringNodeAt(args, 0)

  if (!isNodeCandidate(object) || args.length < 1 || args.length > 2 || !isNodeCandidate(searchArgument)) {
    return null
  }

  if (stringDeps(context).inferExpressionType(searchArgument, context) !== 'string') {
    return null
  }

  const cppValue = emitPreparedCppStringExpression(object, context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    const search = emitPreparedCppStringArgument(searchArgument, context, 'inox_string_index_search')
    const lines: string[] = []

    pushAllLines(lines, cppValue.lines)

    if (search !== null && typeof search !== 'undefined') {
      pushAllLines(lines, search.lines)

      if (args.length > 1) {
        const startArgument = args[1]

        if (stringDeps(context).inferExpressionType(startArgument, context) !== 'number') {
          return null
        }

        const start = stringDeps(context).emitPreparedNumberExpression(startArgument, context)

        pushAllLines(lines, start.lines)

        return {
          lines,
          expression: `${cppValue.expression}.${method}(${search.expression}, ${start.expression})`
        }
      }

      return {
        lines,
        expression: `${cppValue.expression}.${method}(${search.expression})`
      }
    }
  }

  const value = emitPreparedStringBytesOperand(object, context, 'inox_string_index_value')
  const search = emitPreparedStringBytesOperand(searchArgument, context, 'inox_string_index_search')
  const lines: string[] = []
  let startExpression = '0'

  pushAllLines(lines, value.lines)
  pushAllLines(lines, search.lines)

  if (args.length > 1) {
    const startArgument = args[1]

    if (stringDeps(context).inferExpressionType(startArgument, context) !== 'number') {
      return null
    }

    const start = stringDeps(context).emitPreparedNumberExpression(startArgument, context)
    const startRaw = nextCName(context, 'inox_string_index_start_raw')
    const startIndex = nextCName(context, 'inox_string_index_start')

    pushAllLines(lines, start.lines)
    lines.push(`double ${startRaw} = ${start.expression};`)
    pushAllLines(lines, emitNonNegativeStringPositionLines(startRaw, startIndex))
    startExpression = startIndex
  } else if (method === 'lastIndexOf') {
    startExpression = `inox_string_code_unit_length_parts(${value.bytes}, ${value.length})`
  }

  const helper = cStringIndexHelperName(method)

  return {
    lines,
    expression: `${helper}(${value.bytes}, ${value.length}, ${search.bytes}, ${search.length}, ${startExpression})`
  }
}

export function emitCStringIndexValueExpression(
  expression: StringIndexNode,
  context: StringCContext
): PreparedExpression | null {
  if (!isStringIndexExpression(expression, context)) {
    return null
  }

  const object = expression.object
  const indexExpression = expression.index

  if (
    object === null ||
    typeof object === 'undefined' ||
    indexExpression === null ||
    typeof indexExpression === 'undefined'
  ) {
    return null
  }

  const value = emitPreparedStringBytesOperand(object, context, 'inox_string_index_value')
  const index = stringDeps(context).emitPreparedNumberExpression(indexExpression, context)
  const offset = nextCName(context, 'inox_string_index')
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, index.lines)
  lines.push(`size_t ${offset} = (size_t)(${index.expression});`)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_slice_parts(&inox_default_allocator, ${value.bytes}, ${value.length}, ${offset}, ${offset} + 1, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

function isStringIndexExpression(expression: StringIndexNode | null | undefined, context: StringCContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'IndexExpression') {
    return false
  }

  const object = expression.object
  const index = expression.index

  if (object === null || typeof object === 'undefined' || index === null || typeof index === 'undefined') {
    return false
  }

  if (stringDeps(context).inferExpressionType(object, context) !== 'string') {
    return false
  }

  return stringDeps(context).inferExpressionType(index, context) === 'number'
}

function resolveStringMethodCallParts(expression: StringCallNode, method: string): StringMethodCallParts | null {
  const callee = expression.callee
  const args = expression.args

  if (callee === null || typeof callee === 'undefined' || args === null || typeof args === 'undefined') {
    return null
  }

  if (
    callee.type === 'MemberExpression' &&
    callee.property === method &&
    callee.object !== null &&
    typeof callee.object !== 'undefined'
  ) {
    return {
      args,
      object: callee.object
    }
  }

  const path = callee.path

  if (
    callee.type === 'Reference' &&
    path !== null &&
    typeof path !== 'undefined' &&
    path.length >= 2 &&
    path[path.length - 1] === method
  ) {
    return {
      args,
      object: {
        loc: callee.loc,
        path: path.slice(0, path.length - 1),
        type: 'Reference',
        valueType: callee.valueType
      }
    }
  }

  return null
}

function isNodeCandidate(value: any): boolean {
  return value !== null && typeof value !== 'undefined'
}

function nodeValueType(value: AnyNode | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value.valueType === 'string') {
    return value.valueType
  }

  return null
}

export function emitPreparedStringBytesOperand(
  expression: AnyNode | null | undefined,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand {
  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'StringLiteral') {
    return {
      lines: [],
      bytes: cStringLiteral(expression.value),
      length: `${utf8ByteLength(expression.value)}`,
      literalValue: expression.value
    }
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'TemplateLiteral' &&
    !expression.raw.includes('${')
  ) {
    const value = cookTemplateLiteralText(expression.raw.slice(1, -1))

    return {
      lines: [],
      bytes: cStringLiteral(value),
      length: `${utf8ByteLength(value)}`,
      literalValue: value
    }
  }

  const runtimeConstant = runtimeStringConstantValue(expression, context)

  if (runtimeConstant !== null && typeof runtimeConstant !== 'undefined') {
    return {
      lines: [],
      bytes: cStringLiteral(runtimeConstant),
      length: `${utf8ByteLength(runtimeConstant)}`,
      literalValue: runtimeConstant
    }
  }

  if (expression !== null && typeof expression !== 'undefined') {
    const nativeClassString = stringDeps(context).emitPreparedNativeClassStringFieldExpression(expression, context)

    if (nativeClassString !== null && typeof nativeClassString !== 'undefined') {
      return emitPreparedRuntimeStringValueBytesOperand(nativeClassString, context, tempPrefix)
    }
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    stringDeps(context).isNodeRuntimeProducedStringExpression(expression)
  ) {
    const value = stringDeps(context).emitCValueExpression(expression, context)

    return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
  }

  if (expression !== null && typeof expression !== 'undefined' && expression.type === 'TemplateLiteral') {
    const value = emitCTemplateLiteralValueExpression(expression, context)
    return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
  }

  if (
    expression !== null &&
    typeof expression !== 'undefined' &&
    expression.type === 'Reference' &&
    expression.path.length === 1
  ) {
    const name = expression.path[0]
    const moduleRuntimeString = emitPreparedModuleRuntimeStringBytesOperand(expression, context, tempPrefix)

    if (moduleRuntimeString !== null && typeof moduleRuntimeString !== 'undefined') {
      return moduleRuntimeString
    }

    const variables = context.variables
    let valueType = nodeValueType(expression)

    if (variables !== null && typeof variables !== 'undefined') {
      const variableType = variables.get(name)

      if (variableType !== null && typeof variableType !== 'undefined') {
        valueType = variableType
      }
    }

    if (isNullableRuntimeStringReference(name, context)) {
      const string = nextCName(context, tempPrefix)
      const reference = emitCIdentifier(name)

      return {
        lines: [
          emitRuntimeTypeCheck(`${reference}.tag != INOX_TAG_STRING || ${reference}.as.ref == 0`, context),
          `inox_string* ${string} = (inox_string*)${reference}.as.ref;`
        ],
        bytes: `${string}->bytes`,
        length: `${string}->len`
      }
    }

    if (valueType === 'string') {
      const reference = stringDeps(context).emitReference(expression, context)
      const cppStringValues = context.cppStringValues

      if (cppStringValues !== null && typeof cppStringValues !== 'undefined' && cppStringValues.has(name)) {
        return {
          lines: [],
          bytes: `${reference}.bytes()`,
          length: `${reference}.length()`
        }
      }

      if (stringDeps(context).isBoxedRuntimeStringName(name, context)) {
        const string = nextCName(context, tempPrefix)

        return {
          lines: [
            emitRuntimeTypeCheck(`${reference}.tag != INOX_TAG_STRING || ${reference}.as.ref == 0`, context),
            `inox_string* ${string} = (inox_string*)${reference}.as.ref;`
          ],
          bytes: `${string}->bytes`,
          length: `${string}->len`
        }
      }

      const runtimeStrings = context.runtimeStrings

      if (runtimeStrings !== null && typeof runtimeStrings !== 'undefined' && runtimeStrings.has(name)) {
        const runtimeStringValues = context.runtimeStringValues
        let runtimeValue = ''
        let hasRuntimeValue = false

        if (runtimeStringValues !== null && typeof runtimeStringValues !== 'undefined') {
          const currentRuntimeValue = runtimeStringValues.get(name)

          if (currentRuntimeValue !== null && typeof currentRuntimeValue !== 'undefined') {
            runtimeValue = currentRuntimeValue
            hasRuntimeValue = true
          }
        }

        if (hasRuntimeValue) {
          const string = nextCName(context, tempPrefix)

          return {
            lines: [`inox_string* ${string} = (inox_string*)${runtimeValue}.as.ref;`],
            bytes: `${string}->bytes`,
            length: `${string}->len`
          }
        }

        return {
          lines: [],
          bytes: `${reference}->bytes`,
          length: `${reference}->len`
        }
      }

      return {
        lines: [],
        bytes: reference,
        length: `strlen(${reference})`
      }
    }
  }

  if (expression === null || typeof expression === 'undefined') {
    pushStringDiagnostic(
      context,
      diagnostic('INOX_C_STRING_EXPR', 'this string operand is not supported by the current C backend slice', null)
    )

    return {
      lines: [],
      bytes: '""',
      length: '0'
    }
  }

  const netAddressMember = stringDeps(context).resolveNodeNetworkAddressStringMember(expression, context)

  if (netAddressMember !== null && typeof netAddressMember !== 'undefined') {
    return {
      lines: [],
      bytes: netAddressMember,
      length: `strlen(${netAddressMember})`
    }
  }

  const knownObjectString = emitPreparedKnownObjectStringBytesOperand(expression, context, tempPrefix)

  if (knownObjectString !== null && typeof knownObjectString !== 'undefined') {
    return knownObjectString
  }

  const knownOptionalObjectString = emitPreparedKnownOptionalObjectStringBytesOperand(
    expression,
    context,
    tempPrefix
  )

  if (knownOptionalObjectString !== null && typeof knownOptionalObjectString !== 'undefined') {
    return knownOptionalObjectString
  }

  const objectExpressionString = emitPreparedObjectExpressionStringBytesOperand(expression, context, tempPrefix)

  if (objectExpressionString !== null && typeof objectExpressionString !== 'undefined') {
    return objectExpressionString
  }

  const dynamicRuntimeString = emitPreparedDynamicRuntimeStringBytesOperand(expression, context, tempPrefix)

  if (dynamicRuntimeString !== null && typeof dynamicRuntimeString !== 'undefined') {
    return dynamicRuntimeString
  }

  const stringValueCall = emitPreparedStringValueCallBytesOperand(expression, context, tempPrefix)

  if (stringValueCall !== null && typeof stringValueCall !== 'undefined') {
    return stringValueCall
  }

  const runtimeObjectFieldString = emitPreparedRuntimeObjectStringFieldBytesOperand(expression, context, tempPrefix)

  if (runtimeObjectFieldString !== null && typeof runtimeObjectFieldString !== 'undefined') {
    return runtimeObjectFieldString
  }

  const typedStringValue = emitPreparedTypedStringValueBytesOperand(expression, context, tempPrefix)

  if (typedStringValue !== null && typeof typedStringValue !== 'undefined') {
    return typedStringValue
  }

  if (
    !isKnownOptionalObjectStringField(expression, context) &&
    stringDeps(context).inferExpressionType(expression, context) === 'string'
  ) {
    const value = stringDeps(context).emitCValueExpression(expression, context)
    return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
  }

  const runtimeArrayString = emitPreparedRuntimeArrayStringBytesOperand(expression, context, tempPrefix)

  if (runtimeArrayString !== null && typeof runtimeArrayString !== 'undefined') {
    return runtimeArrayString
  }

  const stringIndex = emitCStringIndexValueExpression(expression as StringIndexNode, context)

  if (stringIndex !== null && typeof stringIndex !== 'undefined') {
    return emitPreparedRuntimeStringValueBytesOperand(stringIndex, context, tempPrefix)
  }

  pushStringDiagnostic(
    context,
    diagnostic(
      'INOX_C_STRING_EXPR',
      'this string operand is not supported by the current C backend slice',
      nodeLocation(expression)
    )
  )

  return {
    lines: [],
    bytes: '""',
    length: '0'
  }
}

function emitPreparedTypedStringValueBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  if (nodeValueType(expression) !== 'string' || isKnownOptionalObjectStringField(expression, context)) {
    return null
  }

  const value = stringDeps(context).emitCValueExpression(expression, context)
  return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
}

function emitPreparedStringValueCallBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  if (!isStringValueCallExpression(expression, context)) {
    return null
  }

  const value = emitRuntimeStringValueCallExpression(expression, context) ?? stringDeps(context).emitCValueExpression(expression, context)
  return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
}

function isStringValueCallExpression(expression: AnyNode, context: StringCContext): boolean {
  return (
    isStringSliceCall(expression, context) ||
    isStringTrimCall(expression, context) ||
    isStringCaseCall(expression, context) ||
    isRuntimeStringValueCallExpression(expression, context)
  )
}

function emitRuntimeStringValueCallExpression(expression: AnyNode, context: StringCContext): PreparedExpression | null {
  const method = runtimeStringValueCallMethod(expression)

  if (method === null || typeof method === 'undefined') {
    return null
  }

  if (!canEmitRuntimeStringValueCallExpression(expression, method, context)) {
    return null
  }

  if (method === 'slice') {
    return emitCStringSliceValueExpression(expression, context)
  }

  if (method === 'toUpperCase') {
    return emitCStringCaseValueExpression(expression, context)
  }

  if (method === 'padStart') {
    return emitCStringPadStartValueExpression(expression, context)
  }

  if (isStringTrimMethod(method)) {
    return emitCStringTrimValueExpression(expression, context)
  }

  return null
}

function emitPreparedCppStringExpression(
  expression: AnyNode | null | undefined,
  context: StringCContext
): PreparedExpression | null {
  if (expression === null || typeof expression === 'undefined') {
    return null
  }

  if (expression.type === 'StringLiteral') {
    return {
      lines: [],
      expression: `inox::String(${cStringLiteral(expression.value)})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    const value = cookTemplateLiteralText(expression.raw.slice(1, -1))

    return {
      lines: [],
      expression: `inox::String(${cStringLiteral(value)})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const runtimeConstant = runtimeStringConstantValue(expression, context)

  if (runtimeConstant !== null && typeof runtimeConstant !== 'undefined') {
    return {
      lines: [],
      expression: `inox::String(${cStringLiteral(runtimeConstant)})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const reference = stringDeps(context).emitReference(expression, context)
    const cppStringValues = context.cppStringValues

    if (cppStringValues !== null && typeof cppStringValues !== 'undefined' && cppStringValues.has(name)) {
      return {
        lines: [],
        expression: reference,
        cppType: 'inox::String',
        runtimeTypeChecked: true,
        valueType: 'string'
      }
    }

    const runtimeStrings = context.runtimeStrings

    if (runtimeStrings !== null && typeof runtimeStrings !== 'undefined' && runtimeStrings.has(name)) {
      const runtimeStringValues = context.runtimeStringValues
      let runtimeValue = ''
      let hasRuntimeValue = false

      if (runtimeStringValues !== null && typeof runtimeStringValues !== 'undefined') {
        const currentRuntimeValue = runtimeStringValues.get(name)

        if (currentRuntimeValue !== null && typeof currentRuntimeValue !== 'undefined') {
          runtimeValue = currentRuntimeValue
          hasRuntimeValue = true
        }
      }

      if (hasRuntimeValue) {
        return {
          lines: [],
          expression: `inox::String(${runtimeValue})`,
          cppType: 'inox::String',
          runtimeTypeChecked: true,
          valueType: 'string'
        }
      }
    }

    const variables = context.variables
    let variableType = nodeValueType(expression)

    if (variables !== null && typeof variables !== 'undefined') {
      const currentVariableType = variables.get(name)

      if (currentVariableType !== null && typeof currentVariableType !== 'undefined') {
        variableType = currentVariableType
      }
    }

    if (variableType === 'string') {
      return {
        lines: [],
        expression: `inox::String(${reference})`,
        cppType: 'inox::String',
        runtimeTypeChecked: true,
        valueType: 'string'
      }
    }
  }

  const nativeClassString = stringDeps(context).emitPreparedNativeClassStringFieldExpression(expression, context)

  if (
    nativeClassString !== null &&
    typeof nativeClassString !== 'undefined' &&
    nativeClassString.cppType === 'inox::String'
  ) {
    return nativeClassString
  }

  if (isRuntimeStringValueCallExpression(expression, context)) {
    const value = emitRuntimeStringValueCallExpression(expression, context)

    if (value !== null && typeof value !== 'undefined' && value.cppType === 'inox::String') {
      return value
    }
  }

  return null
}

export function emitPreparedCppStringArgument(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedExpression | null {
  if (expression.type === 'StringLiteral') {
    return {
      lines: [],
      expression: cStringLiteral(expression.value)
    }
  }

  if (expression.type === 'TemplateLiteral' && !expression.raw.includes('${')) {
    return {
      lines: [],
      expression: cStringLiteral(cookTemplateLiteralText(expression.raw.slice(1, -1)))
    }
  }

  const runtimeConstant = runtimeStringConstantValue(expression, context)

  if (runtimeConstant !== null && typeof runtimeConstant !== 'undefined') {
    return {
      lines: [],
      expression: cStringLiteral(runtimeConstant)
    }
  }

  const cppString = emitPreparedCppStringExpression(expression, context)

  if (cppString !== null && typeof cppString !== 'undefined') {
    return cppString
  }

  const bytes = emitPreparedStringBytesOperand(expression, context, tempPrefix)

  return {
    lines: bytes.lines,
    expression: `inox::StringView(${bytes.bytes}, ${bytes.length})`
  }
}

function emitAdoptedCppStringExpression(lines: string[], temp: string): PreparedExpression {
  return {
    lines,
    expression: `inox::String(inox::adopt(${temp}.release()))`,
    cppType: 'inox::String',
    runtimeTypeChecked: true,
    valueType: 'string',
    owned: false
  }
}

function isRuntimeStringValueCallExpression(expression: AnyNode, context: StringCContext): boolean {
  const method = runtimeStringValueCallMethod(expression)

  if (method === null || typeof method === 'undefined') {
    return false
  }

  return canEmitRuntimeStringValueCallExpression(expression, method, context)
}

function runtimeStringValueCallMethod(expression: AnyNode): string | null {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    stringRuntimeReturnType(expression.callee.property) !== 'string'
  ) {
    return null
  }

  return expression.callee.property
}

function canEmitRuntimeStringValueCallExpression(
  expression: AnyNode,
  method: string,
  context: StringCContext
): boolean {
  if (
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    !canEmitStringBytesOperand(expression.callee.object, context)
  ) {
    return false
  }

  if (method === 'slice') {
    if (expression.args.length < 1 || expression.args.length > 2) {
      return false
    }

    for (const arg of expression.args) {
      if (stringDeps(context).inferExpressionType(arg, context) !== 'number') {
        return false
      }
    }

    return true
  }

  if (method === 'toUpperCase' || isStringTrimMethod(method)) {
    return expression.args.length === 0
  }

  if (method === 'padStart') {
    if (expression.args.length < 1 || expression.args.length > 2) {
      return false
    }

    if (stringDeps(context).inferExpressionType(expression.args[0], context) !== 'number') {
      return false
    }

    if (expression.args.length > 1) {
      return canEmitStringBytesOperand(expression.args[1], context)
    }

    return true
  }

  return false
}

function isNullableRuntimeStringReference(name: string, context: StringCContext): boolean {
  const variables = context.variables
  const nullableVariables = context.nullableVariables

  return (
    variables !== null &&
    typeof variables !== 'undefined' &&
    variables.get(name) === 'string' &&
    nullableVariables !== null &&
    typeof nullableVariables !== 'undefined' &&
    nullableVariables.has(name)
  )
}

function isModuleRuntimeStringReference(expression: AnyNode, context: StringCContext): boolean {
  return moduleRuntimeStringStorageName(expression, context) !== null
}

function emitPreparedModuleRuntimeStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  const storage = moduleRuntimeStringStorageName(expression, context)

  if (storage === null || typeof storage === 'undefined') {
    return null
  }

  const string = nextCName(context, tempPrefix)

  return {
    lines: [
      emitRuntimeTypeCheck(`${storage}.tag != INOX_TAG_STRING || ${storage}.as.ref == 0`, context),
      `inox_string* ${string} = (inox_string*)${storage}.as.ref;`
    ],
    bytes: `${string}->bytes`,
    length: `${string}->len`
  }
}

function moduleRuntimeStringStorageName(expression: AnyNode, context: StringCContext): string | null {
  if (expression.type !== 'Reference' || expression.path.length !== 1) {
    return null
  }

  const name = expression.path[0]
  let valueType = nodeValueType(expression)

  if (valueType !== 'string') {
    const variables = context.variables

    if (variables !== null && typeof variables !== 'undefined') {
      const variableType = variables.get(name)

      if (variableType !== null && typeof variableType !== 'undefined') {
        valueType = variableType
      }
    }
  }

  if (valueType !== 'string') {
    return null
  }

  const localValueNames = context.localValueNames

  if (localValueNames !== null && typeof localValueNames !== 'undefined' && localValueNames.has(name)) {
    return null
  }

  const moduleValueNames = context.moduleValueNames
  const moduleValueTypes = context.moduleValueTypes

  if (moduleValueNames === null || typeof moduleValueNames === 'undefined') {
    return null
  }

  if (moduleValueTypes === null || typeof moduleValueTypes === 'undefined') {
    return null
  }

  if (moduleValueTypes.get(name) !== 'unknown') {
    return null
  }

  const storage = moduleValueNames.get(name)

  if (storage === null || typeof storage === 'undefined') {
    return null
  }

  return storage
}

function emitPreparedRuntimeArrayStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  const runtimeElement = stringDeps(context).resolveRuntimeArrayIndex(expression, context)

  if (runtimeElement === null || typeof runtimeElement === 'undefined' || runtimeElement.valueType !== 'string') {
    return null
  }

  const value = stringDeps(context).emitPreparedRuntimeArrayIndexValue(
    expression,
    runtimeElement,
    context,
    tempPrefix
  )
  return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
}

function emitPreparedKnownObjectStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  const field = knownObjectStringField(expression, context)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  const objectName = field.objectName

  if (objectName === null || typeof objectName === 'undefined') {
    return null
  }

  const value = nextCName(context, 'inox_expr_value')
  const string = nextCName(context, tempPrefix)
  const object = stringDeps(context).emitObjectValueReference(objectName, context)
  const key = knownObjectStringFieldReadKey(field, expression)
  const lines: string[] = []

  if (key === null || typeof key === 'undefined') {
    return null
  }

  registerOwnedValue(context, value)

  pushAllLines(lines, emitPrepareOwnedValueWrite(value))
  pushAllLines(lines, emitStringObjectGetValueLines(object, key, value, context))
  lines.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  lines.push(`inox_string* ${string} = (inox_string*)${value}.as.ref;`)

  return {
    lines,
    bytes: `${string}->bytes`,
    length: `${string}->len`
  }
}

function knownObjectStringField(expression: AnyNode, context: StringCContext): CObjectFieldInfo | null {
  let field = stringDeps(context).resolveKnownObjectMember(expression, context)

  if ((field === null || typeof field === 'undefined') && expression.type === 'IndexExpression') {
    field = stringDeps(context).resolveKnownObjectIndex(expression, context)
  }

  if (
    field === null ||
    typeof field === 'undefined' ||
    knownObjectFieldStringType(field) !== 'string' ||
    (field.optional === true && !isNarrowedNullableStringField(expression, field, context))
  ) {
    return null
  }

  return field
}

function knownObjectFieldStringType(field: CObjectFieldInfo): string | null {
  if (field.valueType === 'string') {
    return 'string'
  }

  const declaredType = field.declaredType

  if (declaredType === null || typeof declaredType === 'undefined') {
    return null
  }

  const nullableType = nullableTypeNameFromTypeName(declaredType)

  if (nullableType === 'string') {
    return 'string'
  }

  return null
}

function isNarrowedNullableStringField(
  expression: AnyNode,
  field: CObjectFieldInfo,
  context: StringCContext
): boolean {
  if (knownObjectFieldStringType(field) !== 'string') {
    return false
  }

  if (field.nullable !== true && field.optional !== true && expression.nullable !== true) {
    return false
  }

  const narrowedNullableScalars = context.narrowedNullableScalars

  if (narrowedNullableScalars === null || typeof narrowedNullableScalars === 'undefined') {
    return false
  }

  const path = memberExpressionPath(expression)

  if (path.length === 0) {
    return false
  }

  return narrowedNullableScalars.has(joinStrings(path, '.'))
}

function isKnownOptionalObjectStringField(expression: AnyNode, context: StringCContext): boolean {
  return knownOptionalObjectStringField(expression, context) !== null
}

function knownOptionalObjectStringField(expression: AnyNode, context: StringCContext): CObjectFieldInfo | null {
  let field = stringDeps(context).resolveKnownObjectMember(expression, context)

  if ((field === null || typeof field === 'undefined') && expression.type === 'IndexExpression') {
    field = stringDeps(context).resolveKnownObjectIndex(expression, context)
  }

  if (
    field === null ||
    typeof field === 'undefined' ||
    field.valueType !== 'string' ||
    field.optional !== true
  ) {
    return null
  }

  return field
}

function emitPreparedKnownOptionalObjectStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  const field = knownOptionalObjectStringField(expression, context)

  if (field === null || typeof field === 'undefined') {
    return null
  }

  const objectName = field.objectName

  if (objectName === null || typeof objectName === 'undefined') {
    return null
  }

  const key = knownObjectStringFieldReadKey(field, expression)

  if (key === null || typeof key === 'undefined') {
    return null
  }

  const value = nextCName(context, 'inox_expr_value')
  const string = nextCName(context, tempPrefix)
  const object = stringDeps(context).emitObjectValueReference(objectName, context)
  const lines: string[] = []

  registerOwnedValue(context, value)

  pushAllLines(lines, emitPrepareOwnedValueWrite(value))
  pushAllLines(lines, emitStringObjectGetValueLines(object, key, value, context))
  lines.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  lines.push(`inox_string* ${string} = (inox_string*)${value}.as.ref;`)

  return {
    lines,
    bytes: `${string}->bytes`,
    length: `${string}->len`
  }
}

function knownObjectStringFieldReadKey(field: CObjectFieldInfo, expression: AnyNode): string | null {
  if (field.key !== null && typeof field.key !== 'undefined') {
    return field.key
  }

  if (expression.type === 'MemberExpression') {
    return expression.property
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return expression.index.value
  }

  return null
}

function emitPreparedObjectExpressionStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  let value: PreparedExpression | null = null

  if (stringDeps(context).isMemberAccessExpression(expression)) {
    value = stringDeps(context).emitPreparedObjectExpressionMemberValueExpression(expression, context)
  } else if (expression.type === 'IndexExpression') {
    value = stringDeps(context).emitPreparedObjectExpressionIndexValueExpression(expression, context)
  }

  if (value === null || typeof value === 'undefined' || value.valueType !== 'string') {
    return null
  }

  return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
}

function emitPreparedDynamicRuntimeStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  if (!isDynamicRuntimeStringFieldExpression(expression, context)) {
    return null
  }

  const value = stringDeps(context).emitCValueExpression(expression, context)
  return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
}

function emitPreparedRuntimeObjectStringFieldBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  if (!isRuntimeObjectStringFieldCandidate(expression, context)) {
    return null
  }

  const value = emitPreparedRuntimeObjectFieldValueExpression(expression, context)

  if (value === null || typeof value === 'undefined') {
    return null
  }

  return emitPreparedRuntimeStringValueBytesOperand(value, context, tempPrefix)
}

function emitPreparedRuntimeObjectFieldValueExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedExpression | null {
  const access = runtimeObjectFieldAccess(expression)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  const object = emitPreparedRuntimeObjectReceiverExpression(access.object, context)

  if (object === null || typeof object === 'undefined') {
    return null
  }

  const value = nextCName(context, 'inox_value')
  const lines: string[] = []

  registerOwnedValue(context, value)
  pushAllLines(lines, object.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(value))
  pushAllLines(lines, emitStringObjectGetValueLines(object.expression, access.key, value, context))

  return {
    lines,
    expression: value,
    valueType: expression.valueType
  }
}

function emitPreparedRuntimeObjectReceiverExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedExpression | null {
  if (isRuntimeObjectMetadataReferenceExpression(expression)) {
    return stringDeps(context).emitCValueExpression(expression, context)
  }

  const runtimeObjectReference = stringDeps(context).emitPreparedRuntimeObjectReferenceExpression(expression, context)

  if (runtimeObjectReference !== null && typeof runtimeObjectReference !== 'undefined') {
    return runtimeObjectReference
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]

    if (!hasRuntimeObjectStorageReference(name, context)) {
      const runtimeObjectRoot = stringDeps(context).emitPreparedRuntimeObjectRootReferenceExpression(name, context)

      if (runtimeObjectRoot !== null && typeof runtimeObjectRoot !== 'undefined') {
        return runtimeObjectRoot
      }
    }

    return {
      lines: [],
      expression: stringDeps(context).emitObjectValueReference(name, context),
      valueType: 'object'
    }
  }

  if (expression.type === 'ThisExpression') {
    return {
      lines: [],
      expression: emitCIdentifier('this'),
      valueType: 'object'
    }
  }

  const nested = emitPreparedRuntimeObjectFieldValueExpression(expression, context)

  if (nested !== null && typeof nested !== 'undefined') {
    return nested
  }

  return stringDeps(context).emitCValueExpression(expression, context)
}

function hasRuntimeObjectStorageReference(name: string, context: StringCContext): boolean {
  const localValueNames = context.localValueNames

  if (localValueNames !== null && typeof localValueNames !== 'undefined' && localValueNames.has(name)) {
    return true
  }

  const variables = context.variables

  if (variables !== null && typeof variables !== 'undefined' && variables.has(name)) {
    return true
  }

  const moduleValueNames = context.moduleValueNames

  return moduleValueNames !== null && typeof moduleValueNames !== 'undefined' && moduleValueNames.has(name)
}

function isDynamicRuntimeStringFieldExpression(expression: AnyNode, context: StringCContext): boolean {
  const object = dynamicRuntimeObjectFieldObject(expression)

  if (object === null || typeof object === 'undefined') {
    return false
  }

  if (knownObjectFieldValueType(expression, context)) {
    return false
  }

  return isDynamicRuntimeObjectExpression(object, context)
}

function isDynamicRuntimeObjectExpression(expression: AnyNode, context: StringCContext): boolean {
  if (isRuntimeObjectValueReferenceExpression(expression, context)) {
    return true
  }

  if (stringDeps(context).inferExpressionType(expression, context) === 'object') {
    return true
  }

  if (isRuntimeArrayObjectIndexExpression(expression, context)) {
    return true
  }

  const knownValueType = knownObjectFieldValueType(expression, context)

  if (knownValueType !== null && typeof knownValueType !== 'undefined') {
    return knownValueType === 'object'
  }

  const object = dynamicRuntimeObjectFieldObject(expression)

  if (object === null || typeof object === 'undefined') {
    return false
  }

  return isDynamicRuntimeObjectExpression(object, context)
}

function isRuntimeObjectStringFieldCandidate(expression: AnyNode, context: StringCContext): boolean {
  const access = runtimeObjectFieldAccess(expression)

  if (access === null || typeof access === 'undefined') {
    return false
  }

  const fieldValueType = knownObjectFieldValueType(expression, context)

  if (fieldValueType === 'string') {
    return true
  }

  if (
    fieldValueType !== null &&
    typeof fieldValueType !== 'undefined' &&
    fieldValueType !== 'unknown'
  ) {
    return false
  }

  return isRuntimeObjectReceiverCandidate(access.object, context)
}

function isRuntimeObjectReceiverCandidate(expression: AnyNode, context: StringCContext): boolean {
  const objectValueType = nodeValueType(expression)

  if (objectValueType === 'object' || objectValueType === 'unknown') {
    return true
  }

  if (
    objectValueType !== null &&
    typeof objectValueType !== 'undefined' &&
    objectValueType !== 'object' &&
    objectValueType !== 'unknown'
  ) {
    return false
  }

  if (stringDeps(context).inferExpressionType(expression, context) === 'object') {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const valueType = runtimeObjectReferenceValueType(expression.path[0], context)

    if (valueType === null || typeof valueType === 'undefined') {
      return true
    }

    return valueType === 'object' || valueType === 'unknown' || isOpaqueRuntimeValueType(valueType)
  }

  const access = runtimeObjectFieldAccess(expression)

  if (access !== null && typeof access !== 'undefined') {
    const fieldValueType = knownObjectFieldValueType(expression, context)

    if (
      fieldValueType !== null &&
      typeof fieldValueType !== 'undefined' &&
      fieldValueType !== 'object' &&
      fieldValueType !== 'unknown'
    ) {
      return false
    }

    return true
  }

  return isDynamicRuntimeObjectExpression(expression, context)
}

function runtimeObjectReferenceValueType(name: string, context: StringCContext): string | null {
  const variables = context.variables

  if (variables !== null && typeof variables !== 'undefined') {
    const variableType = variables.get(name)

    if (variableType !== null && typeof variableType !== 'undefined') {
      return variableType
    }
  }

  const moduleValueTypes = context.moduleValueTypes

  if (moduleValueTypes !== null && typeof moduleValueTypes !== 'undefined') {
    const moduleValueType = moduleValueTypes.get(name)

    if (moduleValueType !== null && typeof moduleValueType !== 'undefined') {
      return moduleValueType
    }
  }

  return null
}

function isRuntimeObjectValueReferenceExpression(expression: AnyNode, context: StringCContext): boolean {
  if (isRuntimeObjectMetadataReferenceExpression(expression)) {
    return true
  }

  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return false
  }

  const variables = context.variables

  if (variables === null || typeof variables === 'undefined') {
    return false
  }

  const name = expression.path[0]
  const valueType = variables.get(name)

  if (valueType !== 'object' && valueType !== 'unknown' && !isOpaqueRuntimeValueType(valueType)) {
    return false
  }

  return runtimeValueReferenceUsesInoxValueStorage(name, valueType, context)
}

function isRuntimeObjectMetadataReferenceExpression(expression: AnyNode): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'Reference' ||
    expression.path.length !== 1
  ) {
    return false
  }

  return (
    expression.runtimeObjectSource !== null &&
    typeof expression.runtimeObjectSource !== 'undefined' &&
    expression.runtimeObjectName !== null &&
    typeof expression.runtimeObjectName !== 'undefined'
  )
}

function runtimeValueReferenceUsesInoxValueStorage(
  name: string,
  valueType: string | null | undefined,
  context: StringCContext
): boolean {
  if (valueType === 'unknown' || isOpaqueRuntimeValueType(valueType)) {
    return true
  }

  if (!isManagedRuntimeReturnType(valueType)) {
    return false
  }

  if (valueType === 'string') {
    return isOwnedRuntimeValueName(name, context)
  }

  return true
}

function isOwnedRuntimeValueName(name: string, context: StringCContext): boolean {
  for (const value of context.ownedValues) {
    if (value === name) {
      return true
    }
  }

  return false
}

function isRuntimeArrayObjectIndexExpression(expression: AnyNode, context: StringCContext): boolean {
  const element = stringDeps(context).resolveRuntimeArrayIndex(expression, context)

  if (element === null || typeof element === 'undefined') {
    return false
  }

  return element.valueType === 'object' || element.valueType === 'unknown'
}

function knownObjectFieldValueType(expression: AnyNode, context: StringCContext): string | null {
  const shapeFieldValueType = nodeObjectShapeFieldValueType(expression)

  if (shapeFieldValueType !== null && typeof shapeFieldValueType !== 'undefined') {
    return shapeFieldValueType
  }

  const member = stringDeps(context).resolveKnownObjectMember(expression, context)

  if (member !== null && typeof member !== 'undefined') {
    return member.valueType
  }

  if (expression.type === 'IndexExpression') {
    const field = stringDeps(context).resolveKnownObjectIndex(expression, context)

    if (field !== null && typeof field !== 'undefined') {
      return field.valueType
    }
  }

  return null
}

function nodeObjectShapeFieldValueType(expression: AnyNode): string | null {
  const access = runtimeObjectFieldAccess(expression)

  if (access === null || typeof access === 'undefined') {
    return null
  }

  const shape = access.object.shape

  if (
    shape === null ||
    typeof shape === 'undefined' ||
    shape.fields === null ||
    typeof shape.fields === 'undefined'
  ) {
    return null
  }

  for (const field of shape.fields) {
    if (field.name === access.key) {
      return field.valueType
    }
  }

  return null
}

function dynamicRuntimeObjectFieldObject(expression: AnyNode): AnyNode | null {
  if (expression.type === 'Reference' && expression.path.length > 1) {
    return referencePathObjectExpression(expression)
  }

  if (expression.type === 'MemberExpression') {
    return expression.object
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return expression.object
  }

  return null
}

function runtimeObjectFieldAccess(expression: AnyNode): RuntimeObjectFieldAccess | null {
  if (expression.type === 'Reference' && expression.path.length > 1) {
    return {
      object: referencePathObjectExpression(expression),
      key: stringPathAt(expression.path, expression.path.length - 1)
    }
  }

  if (expression.type === 'MemberExpression') {
    return {
      object: expression.object,
      key: expression.property
    }
  }

  if (expression.type === 'IndexExpression' && expression.index.type === 'StringLiteral') {
    return {
      object: expression.object,
      key: expression.index.value
    }
  }

  return null
}

function referencePathObjectExpression(expression: AnyNode): AnyNode {
  const path: string[] = []

  for (let index = 0; index < expression.path.length - 1; index = index + 1) {
    path.push(stringPathAt(expression.path, index))
  }

  const object: AnyNode = {
    type: 'Reference',
    path
  }

  if (expression.loc !== null && typeof expression.loc !== 'undefined') {
    object.loc = expression.loc
  }

  return object
}

export function emitCStringConcatValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const left = emitPreparedStringBytesOperand(expression.left, context, 'inox_cmp_string')
  const right = emitPreparedStringBytesOperand(expression.right, context, 'inox_cmp_string')
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, left.lines)
  pushAllLines(lines, right.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_concat_parts(&inox_default_allocator, ${left.bytes}, ${left.length}, ${right.bytes}, ${right.length}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

export function emitCTemplateLiteralValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  if (expression.raw.includes('${')) {
    const formatted = emitCTemplateLiteralFormatExpression(expression, context)
    const temp = nextCName(context, 'inox_value')
    const args = [cStringLiteral(formatted.format)]
    const lines: string[] = []

    for (const value of formatted.values) {
      args.push(value)
    }

    registerOwnedValue(context, temp)
    pushAllLines(lines, formatted.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(`inox_string_from_format(&inox_default_allocator, &${temp}, ${joinStrings(args, ', ')})`, context)
    )

    return {
      lines,
      expression: temp
    }
  }

  const value = cookTemplateLiteralText(expression.raw.slice(1, -1))
  const lines: string[] = []
  const temp = nextCName(context, 'inox_value')
  registerOwnedValue(context, temp)

  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_from_literal(&inox_default_allocator, ${cStringLiteral(value)}, ${utf8ByteLength(value)}, &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

export function emitCTemplateLiteralFormatExpression(expression: AnyNode, context: StringCContext): PreparedStringFormat {
  const diagnostics = context.diagnostics ?? []
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics }, expression.loc)
  const lines: string[] = []
  const formats: string[] = []
  const values: string[] = []

  for (const part of parts) {
    if (part.kind === 'text') {
      formats.push(escapeCPrintfFormatText(cookTemplateLiteralText(part.value)))
      continue
    }

    if (part.loc === null || typeof part.loc === 'undefined') {
      continue
    }

    const placeholder = parseTemplatePlaceholderExpression(part.value, part.loc, context)

    if (placeholder === null || typeof placeholder === 'undefined') {
      continue
    }

    const formatted = emitPreparedTemplatePlaceholderFormat(placeholder, context)

    pushAllLines(lines, formatted.lines)
    formats.push(formatted.format)
    pushAllLines(values, formatted.values)
  }

  return {
    lines,
    format: joinStrings(formats, ''),
    values
  }
}

function emitPreparedTemplatePlaceholderFormat(expression: AnyNode, context: StringCContext): PreparedStringFormat {
  const valueType = stringDeps(context).inferExpressionType(expression, context)
  const knownString = emitPreparedKnownTemplatePlaceholderStringBytesOperand(
    expression,
    context,
    'inox_template_string'
  )

  if (knownString !== null && typeof knownString !== 'undefined') {
    return emitPreparedStringBytesFormat(knownString)
  }

  const classString = stringDeps(context).emitPreparedClassToStringExpression(expression, context)

  if (classString !== null && typeof classString !== 'undefined') {
    return emitPreparedStringBytesFormat(
      emitPreparedRuntimeStringValueBytesOperand(classString, context, 'inox_template_string')
    )
  }

  if (valueType === 'string') {
    return emitPreparedStringBytesFormat(emitPreparedStringBytesOperand(expression, context, 'inox_template_string'))
  }

  if (valueType === 'number') {
    const value = stringDeps(context).emitPreparedNumberExpression(expression, context)

    return {
      lines: value.lines,
      format: '%.17g',
      values: [`((double)${value.expression})`]
    }
  }

  if (valueType === 'boolean') {
    const value = stringDeps(context).emitPreparedNumberExpression(expression, context)

    return {
      lines: value.lines,
      format: '%s',
      values: [`((${value.expression}) != 0 ? "true" : "false")`]
    }
  }

  if (valueType === 'null') {
    return {
      lines: [],
      format: 'null',
      values: []
    }
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    const value = emitCStringConversionValueExpression(
      {
        type: 'CallExpression',
        callee: {
          type: 'Reference',
          path: ['String'],
          loc: expression.loc
        },
        args: [expression],
        loc: expression.loc
      },
      context
    )

    return emitPreparedStringBytesFormat(
      emitPreparedRuntimeStringValueBytesOperand(value, context, 'inox_template_string')
    )
  }

  pushStringDiagnostic(
    context,
    diagnostic(
      cUnsupportedExpressionCode(valueType),
      'template placeholders currently support string, number, boolean and null expressions in C',
      nodeLocation(expression)
    )
  )

  return {
    lines: [],
    format: '',
    values: []
  }
}

function emitPreparedStringBytesFormat(operand: PreparedStringBytesOperand): PreparedStringFormat {
  return {
    lines: operand.lines,
    format: '%.*s',
    values: [`(int)${operand.length}`, operand.bytes]
  }
}

function emitPreparedRuntimeStringValueBytesOperand(
  value: PreparedExpression,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand {
  const lines: string[] = []

  pushAllLines(lines, value.lines)

  if (value.cppType === 'inox::String') {
    const string = nextCName(context, tempPrefix)

    lines.push(`auto ${string} = ${value.expression};`)
    lines.push(emitRuntimeTypeCheck(`!${string}.valid()`, context))

    return {
      lines,
      bytes: `${string}.bytes()`,
      length: `${string}.length()`
    }
  }

  const string = nextCName(context, tempPrefix)

  lines.push(emitRuntimeTypeCheck(`${value.expression}.tag != INOX_TAG_STRING || ${value.expression}.as.ref == 0`, context))
  lines.push(`inox_string* ${string} = (inox_string*)${value.expression}.as.ref;`)

  return {
    lines,
    bytes: `${string}->bytes`,
    length: `${string}->len`
  }
}

function emitPreparedKnownTemplatePlaceholderStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  const known = emitPreparedKnownObjectStringBytesOperand(expression, context, tempPrefix)

  if (known !== null && typeof known !== 'undefined') {
    return known
  }

  return emitPreparedRuntimeObjectNameStringBytesOperand(expression, context, tempPrefix)
}

function emitPreparedRuntimeObjectNameStringBytesOperand(
  expression: AnyNode,
  context: StringCContext,
  tempPrefix: string
): PreparedStringBytesOperand | null {
  const objectName = runtimeObjectNameStringMemberObjectName(expression, context)

  if (objectName === null || typeof objectName === 'undefined') {
    return null
  }

  const value = nextCName(context, 'inox_expr_value')
  const string = nextCName(context, tempPrefix)
  const object = stringDeps(context).emitObjectValueReference(objectName, context)
  const lines: string[] = []

  registerOwnedValue(context, value)
  pushAllLines(lines, emitPrepareOwnedValueWrite(value))
  pushAllLines(lines, emitStringObjectGetValueLines(object, 'name', value, context))
  lines.push(emitRuntimeTypeCheck(`${value}.tag != INOX_TAG_STRING || ${value}.as.ref == 0`, context))
  lines.push(`inox_string* ${string} = (inox_string*)${value}.as.ref;`)

  return {
    lines,
    bytes: `${string}->bytes`,
    length: `${string}->len`
  }
}

function runtimeObjectNameStringMemberObjectName(expression: AnyNode, context: StringCContext): string | null {
  if (!stringDeps(context).isMemberAccessExpression(expression) || expression.property !== 'name') {
    return null
  }

  if (expression.object.type !== 'Reference' || expression.object.path.length !== 1) {
    return null
  }

  const objectName = stringPathAt(expression.object.path, 0)
  const variables = context.variables

  if (variables === null || typeof variables === 'undefined') {
    return null
  }

  const valueType = variables.get(objectName)

  if (valueType !== 'object' && valueType !== 'unknown') {
    return null
  }

  return objectName
}

export function emitCStringConversionValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const arg = expression.args[0]
  const classString = stringDeps(context).emitPreparedClassToStringExpression(arg, context)

  if (classString !== null && typeof classString !== 'undefined') {
    return classString
  }

  const valueType = stringDeps(context).inferExpressionType(arg, context)
  const temp = nextCName(context, 'inox_value')
  registerOwnedValue(context, temp)

  if (valueType === 'string') {
    const value = emitPreparedStringBytesOperand(arg, context, 'inox_string_conversion')
    const lines: string[] = []

    pushAllLines(lines, value.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(
        `inox_string_from_literal(&inox_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
        context
      )
    )

    return {
      lines,
      expression: temp
    }
  }

  if (valueType === 'null') {
    const lines: string[] = []

    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(emitStatusCheck(`inox_string_from_literal(&inox_default_allocator, "null", 4, &${temp})`, context))

    return {
      lines,
      expression: temp
    }
  }

  if (valueType === 'unknown' || isManagedRuntimeReturnType(valueType) || isOpaqueRuntimeValueType(valueType)) {
    const value = stringDeps(context).emitCValueExpression(arg, context)
    const lines: string[] = []

    pushAllLines(lines, value.lines)
    pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
    lines.push(
      emitStatusCheck(`inox_string_from_value(&inox_default_allocator, ${value.expression}, &${temp})`, context)
    )

    return {
      lines,
      expression: temp
    }
  }

  const value = stringDeps(context).emitPreparedNumberExpression(arg, context)
  let helper = `inox_string_from_number(&inox_default_allocator, ${value.expression}, &${temp})`
  const lines: string[] = []

  if (valueType === 'boolean') {
    helper = `inox_string_from_bool(&inox_default_allocator, (${value.expression}) != 0, &${temp})`
  }

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(helper, context))

  return {
    lines,
    expression: temp
  }
}

export function emitCNumberToStringValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const value = stringDeps(context).emitPreparedNumberExpression(expression.callee.object, context)
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))

  if (expression.args.length === 0) {
    lines.push(
      emitStatusCheck(`inox_string_from_number(&inox_default_allocator, ${value.expression}, &${temp})`, context)
    )

    return {
      lines,
      expression: temp
    }
  }

  const radix = stringDeps(context).emitPreparedNumberExpression(stringNodeAt(expression.args, 0), context)

  pushAllLines(lines, radix.lines)
  lines.push(
    emitStatusCheck(
      `inox_string_from_number_radix(&inox_default_allocator, ${value.expression}, (int)(${radix.expression}), &${temp})`,
      context
    )
  )

  return {
    lines,
    expression: temp
  }
}

export function emitCNumberConversionValueExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedExpression | null {
  if (!isNumberConversionCall(expression, context)) {
    return null
  }

  const value = emitPreparedStringBytesOperand(expression.args[0], context, 'inox_number_conversion')
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`inox_string_to_number(${value.bytes}, ${value.length}, &${temp})`, context))

  return {
    lines,
    expression: temp
  }
}

export function emitCStringTrimValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const cppValue = emitPreparedCppStringExpression(expression.callee.object, context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    return {
      lines: cppValue.lines,
      expression: `${cppValue.expression}.${expression.callee.property}()`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'inox_trim_string')
  const helper = cStringTrimHelperName(expression.callee.property)
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(emitStatusCheck(`${helper}(&inox_default_allocator, ${value.bytes}, ${value.length}, &${temp})`, context))

  return emitAdoptedCppStringExpression(lines, temp)
}

export function emitCStringCaseValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const cppValue = emitPreparedCppStringExpression(expression.callee.object, context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    return {
      lines: cppValue.lines,
      expression: `${cppValue.expression}.toUpperCase()`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'inox_case_string')
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_to_upper_case_parts(&inox_default_allocator, ${value.bytes}, ${value.length}, &${temp})`,
      context
    )
  )

  return emitAdoptedCppStringExpression(lines, temp)
}

export function emitCStringPadStartValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const cppValue = emitPreparedCppStringExpression(expression.callee.object, context)
  const targetLength = stringDeps(context).emitPreparedNumberExpression(expression.args[0], context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    const lines: string[] = []
    let padExpression = ''

    pushAllLines(lines, cppValue.lines)
    pushAllLines(lines, targetLength.lines)

    if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      const pad = emitPreparedCppStringArgument(expression.args[1], context, 'inox_pad_fill')

      if (pad !== null && typeof pad !== 'undefined') {
        pushAllLines(lines, pad.lines)
        padExpression = `, ${pad.expression}`
      }
    }

    return {
      lines,
      expression: `${cppValue.expression}.padStart(${targetLength.expression}${padExpression})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'inox_pad_string')
  let pad: PreparedStringBytesOperand = {
    lines: [],
    bytes: cStringLiteral(' '),
    length: '1'
  }

  if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
    pad = emitPreparedStringBytesOperand(expression.args[1], context, 'inox_pad_fill')
  }

  const targetLengthRaw = nextCName(context, 'inox_pad_target_length_raw')
  const targetLengthIndex = nextCName(context, 'inox_pad_target_length')
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, targetLength.lines)
  pushAllLines(lines, pad.lines)
  lines.push(`double ${targetLengthRaw} = ${targetLength.expression};`)
  pushAllLines(lines, emitNonNegativeStringPositionLines(targetLengthRaw, targetLengthIndex))
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_pad_start_parts(&inox_default_allocator, ${value.bytes}, ${value.length}, ${targetLengthIndex}, ${pad.bytes}, ${pad.length}, &${temp})`,
      context
    )
  )

  return emitAdoptedCppStringExpression(lines, temp)
}

export function emitCStringSliceValueExpression(expression: AnyNode, context: StringCContext): PreparedExpression {
  const cppValue = emitPreparedCppStringExpression(expression.callee.object, context)
  const start = stringDeps(context).emitPreparedNumberExpression(expression.args[0], context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    const lines: string[] = []
    let endExpression = ''

    pushAllLines(lines, cppValue.lines)
    pushAllLines(lines, start.lines)

    if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
      const end = stringDeps(context).emitPreparedNumberExpression(expression.args[1], context)

      pushAllLines(lines, end.lines)
      endExpression = `, ${end.expression}`
    }

    return {
      lines,
      expression: `${cppValue.expression}.slice(${start.expression}${endExpression})`,
      cppType: 'inox::String',
      runtimeTypeChecked: true,
      valueType: 'string'
    }
  }

  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'inox_slice_string')
  const lengthName = nextCName(context, 'inox_slice_length')
  const startRaw = nextCName(context, 'inox_slice_start_raw')
  const startIndex = nextCName(context, 'inox_slice_start')
  const endRaw = nextCName(context, 'inox_slice_end_raw')
  const endIndex = nextCName(context, 'inox_slice_end')
  let end: PreparedExpression = {
    lines: [],
    expression: `((double)${lengthName})`
  }
  const temp = nextCName(context, 'inox_value')
  const lines: string[] = []

  if (expression.args[1] !== null && typeof expression.args[1] !== 'undefined') {
    end = stringDeps(context).emitPreparedNumberExpression(expression.args[1], context)
  }

  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, start.lines)
  lines.push(`size_t ${lengthName} = inox_string_code_unit_length_parts(${value.bytes}, ${value.length});`)
  pushAllLines(lines, end.lines)
  lines.push(`double ${startRaw} = ${start.expression};`)
  lines.push(`double ${endRaw} = ${end.expression};`)
  pushAllLines(lines, emitSliceIndexNormalizationLines(startRaw, lengthName, startIndex, context, 'inox_slice_start'))
  pushAllLines(lines, emitSliceIndexNormalizationLines(endRaw, lengthName, endIndex, context, 'inox_slice_end'))
  lines.push(`if (${endIndex} < ${startIndex}) ${endIndex} = ${startIndex};`)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_slice_parts(&inox_default_allocator, ${value.bytes}, ${value.length}, ${startIndex}, ${endIndex}, &${temp})`,
      context
    )
  )

  return emitAdoptedCppStringExpression(lines, temp)
}

export function emitCStringSplitValueExpression(
  expression: AnyNode,
  context: StringCContext
): PreparedStringSplitExpression {
  const cppValue = emitPreparedCppStringExpression(expression.callee.object, context)

  if (cppValue !== null && typeof cppValue !== 'undefined') {
    const separator = emitPreparedCppStringArgument(expression.args[0], context, 'inox_split_separator')
    const lines: string[] = []

    pushAllLines(lines, cppValue.lines)

    if (separator !== null && typeof separator !== 'undefined') {
      pushAllLines(lines, separator.lines)

      return {
        lines,
        expression: `${cppValue.expression}.split(${separator.expression})`,
        cppType: 'Array',
        elementType: 'string',
        runtimeTypeChecked: true,
        valueType: 'array'
      }
    }
  }

  const value = emitPreparedStringBytesOperand(expression.callee.object, context, 'inox_split_string')
  const separator = emitPreparedStringBytesOperand(expression.args[0], context, 'inox_split_separator')
  const temp = nextCName(context, 'inox_split_array')
  const lines: string[] = []
  registerOwnedValue(context, temp)

  pushAllLines(lines, value.lines)
  pushAllLines(lines, separator.lines)
  pushAllLines(lines, emitPrepareOwnedValueWrite(temp))
  lines.push(
    emitStatusCheck(
      `inox_string_split_parts(&inox_default_allocator, ${value.bytes}, ${value.length}, ${separator.bytes}, ${separator.length}, &${temp})`,
      context
    )
  )
  lines.push(emitRuntimeValueCheck(temp, 'INOX_TAG_ARRAY', context))

  return {
    lines,
    expression: temp,
    elementType: 'string'
  }
}

export function isStringConcatExpression(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'BinaryExpression') {
    return false
  }

  if (expression.operator !== '+') {
    return false
  }

  return (
    stringDeps(context).inferExpressionType(expression.left, context) === 'string' &&
    stringDeps(context).inferExpressionType(expression.right, context) === 'string'
  )
}

export function isRuntimeProducedStringExpression(
  expression: AnyNode | null | undefined,
  context: StringCContext
): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (
    expression.type === 'CallExpression' &&
    stringDeps(context).inferExpressionType(expression, context) === 'string'
  ) {
    return true
  }

  if (stringDeps(context).isNodeRuntimeProducedStringExpression(expression)) {
    return true
  }

  if (
    (stringDeps(context).isMemberAccessExpression(expression) || expression.type === 'IndexExpression') &&
    stringDeps(context).inferExpressionType(expression, context) === 'string'
  ) {
    return true
  }

  if (
    expression.type === 'AwaitExpression' &&
    stringDeps(context).inferExpressionType(expression, context) === 'string'
  ) {
    return true
  }

  if (isStringConcatExpression(expression, context)) {
    return true
  }

  if (isStringIndexExpression(expression, context)) {
    return true
  }

  if (expression.type === 'TemplateLiteral' && expression.raw.includes('${')) {
    return true
  }

  if (
    expression.type === 'ConditionalExpression' &&
    stringDeps(context).inferExpressionType(expression, context) === 'string'
  ) {
    return true
  }

  if (
    isCoalesceExpression(expression) &&
    stringDeps(context).canLowerCNullishCoalescingExpression(expression, context)
  ) {
    return true
  }

  return stringDeps(context).isBoxedRuntimeStringReference(expression, context)
}

export function isRawStringLiteralExpression(expression: AnyNode | null | undefined): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  return expression.type === 'TemplateLiteral' && !expression.raw.includes('${')
}

export function isStringConversionCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.args.length !== 1
  ) {
    return false
  }

  const path: string[] = expression.callee.path

  if (path[0] !== 'String') {
    return false
  }

  const arg = stringNodeAt(expression.args, 0)

  if (stringDeps(context).hasClassToStringExpression(arg, context)) {
    return true
  }

  const valueType = stringDeps(context).inferExpressionType(arg, context)

  return valueType === 'boolean' || valueType === 'null' || valueType === 'number' || valueType === 'string'
}

export function isNumberConversionCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'Reference' ||
    expression.callee.path.length !== 1 ||
    expression.args.length !== 1
  ) {
    return false
  }

  const path: string[] = expression.callee.path

  if (path[0] !== 'Number') {
    return false
  }

  return stringDeps(context).inferExpressionType(stringNodeAt(expression.args, 0), context) === 'string'
}

export function isNumberToStringCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'toString' ||
    expression.args.length > 1
  ) {
    return false
  }

  if (stringDeps(context).inferExpressionType(expression.callee.object, context) !== 'number') {
    return false
  }

  if (expression.args.length === 0) {
    return true
  }

  return stringDeps(context).inferExpressionType(stringNodeAt(expression.args, 0), context) === 'number'
}

export function isStringTrimCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    !isStringTrimMethod(expression.callee.property) ||
    expression.args.length !== 0
  ) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

export function isStringCaseCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'toUpperCase' ||
    expression.args.length !== 0
  ) {
    return false
  }

  return isStringLengthObject(expression.callee.object, context)
}

export function isStringPadStartCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'padStart' ||
    expression.args.length < 1 ||
    expression.args.length > 2
  ) {
    return false
  }

  if (!isStringLengthObject(expression.callee.object, context)) {
    return false
  }

  if (stringDeps(context).inferExpressionType(expression.args[0], context) !== 'number') {
    return false
  }

  if (expression.args.length > 1) {
    return stringDeps(context).inferExpressionType(expression.args[1], context) === 'string'
  }

  return true
}

export function isStringIndexCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    !isStringIndexMethod(expression.callee.property) ||
    expression.args.length < 1 ||
    expression.args.length > 2
  ) {
    return false
  }

  if (!isStringLengthObject(expression.callee.object, context)) {
    return false
  }

  if (stringDeps(context).inferExpressionType(expression.args[0], context) !== 'string') {
    return false
  }

  if (expression.args.length > 1) {
    return stringDeps(context).inferExpressionType(expression.args[1], context) === 'number'
  }

  return true
}

export function isStringSliceCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'slice' ||
    expression.args.length < 1 ||
    expression.args.length > 2
  ) {
    return false
  }

  if (!isStringLengthObject(expression.callee.object, context)) {
    return false
  }

  for (const arg of expression.args) {
    if (stringDeps(context).inferExpressionType(arg, context) !== 'number') {
      return false
    }
  }

  return true
}

export function isStringSplitCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.property !== 'split' ||
    expression.args.length !== 1
  ) {
    return false
  }

  return (
    isStringLengthObject(expression.callee.object, context) &&
    stringDeps(context).inferExpressionType(expression.args[0], context) === 'string'
  )
}

export function isStringPredicateCall(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    !isStringPredicateMethod(expression.callee.property)
  ) {
    return false
  }

  const method = expression.callee.property
  let maxArgs = 1

  if (method === 'includes') {
    maxArgs = 2
  }

  if (expression.args.length < 1 || expression.args.length > maxArgs) {
    return false
  }

  if (!isStringLengthObject(expression.callee.object, context)) {
    return false
  }

  if (stringDeps(context).inferExpressionType(expression.args[0], context) !== 'string') {
    return false
  }

  if (expression.args.length > 1) {
    return stringDeps(context).inferExpressionType(expression.args[1], context) === 'number'
  }

  return true
}

function cStringPredicateHelperName(method: string): string {
  if (method === 'startsWith') {
    return 'inox_string_starts_with_parts'
  }

  if (method === 'endsWith') {
    return 'inox_string_ends_with_parts'
  }

  return 'inox_string_includes_parts'
}

function cStringIndexHelperName(method: string): string {
  if (method === 'lastIndexOf') {
    return 'inox_string_last_index_of_parts'
  }

  return 'inox_string_index_of_parts'
}

function cStringTrimHelperName(method: string): string {
  if (method === 'trimStart' || method === 'trimLeft') {
    return 'inox_string_trim_start_parts'
  }

  if (method === 'trimEnd' || method === 'trimRight') {
    return 'inox_string_trim_end_parts'
  }

  return 'inox_string_trim_parts'
}

function emitNonNegativeStringPositionLines(raw: string, target: string): string[] {
  return [
    `size_t ${target} = 0;`,
    `if (${raw} > 0) ${target} = ${raw} > (double)((size_t)-1) ? ((size_t)-1) : (size_t)${raw};`
  ]
}

function isStringTrimMethod(method: string): boolean {
  return (
    method === 'trim' ||
    method === 'trimEnd' ||
    method === 'trimLeft' ||
    method === 'trimRight' ||
    method === 'trimStart'
  )
}

function stringIndexMethodName(expression: any): string | null {
  if (expression.stringRuntimeMethod === 'indexOf') {
    return 'indexOf'
  }

  if (expression.stringRuntimeMethod === 'lastIndexOf') {
    return 'lastIndexOf'
  }

  if (
    expression.type !== 'CallExpression' ||
    expression.callee === null ||
    typeof expression.callee === 'undefined' ||
    expression.callee.type !== 'MemberExpression'
  ) {
    return null
  }

  if (expression.callee.property === 'indexOf') {
    return 'indexOf'
  }

  if (expression.callee.property === 'lastIndexOf') {
    return 'lastIndexOf'
  }

  return null
}

function isStringLengthObject(expression: AnyNode | null | undefined, context: StringCContext): boolean {
  if (expression === null || typeof expression === 'undefined') {
    return false
  }

  if (expression.type === 'StringLiteral') {
    return true
  }

  if (expression.type === 'TemplateLiteral') {
    return true
  }

  if (nodeValueType(expression) === 'string') {
    return true
  }

  if (stringDeps(context).isNodeRuntimeProducedStringExpression(expression)) {
    return true
  }

  if (expression.type === 'Reference' && expression.path.length === 1) {
    const name = expression.path[0]
    const variables = context.variables
    const runtimeStrings = context.runtimeStrings

    return (
      (variables !== null && typeof variables !== 'undefined' && variables.get(name) === 'string') ||
      (runtimeStrings !== null && typeof runtimeStrings !== 'undefined' && runtimeStrings.has(name)) ||
      stringDeps(context).inferExpressionType(expression, context) === 'string'
    )
  }

  if (isDynamicRuntimeStringFieldExpression(expression, context)) {
    return true
  }

  return stringDeps(context).inferExpressionType(expression, context) === 'string'
}

function parseTemplateLiteralParts(
  raw: string,
  context: StringDiagnosticContext,
  loc: SourceLocation | undefined
): TemplateLiteralPart[] {
  const parts: TemplateLiteralPart[] = []
  let text = ''
  let index = 1
  let end = raw.length
  const locationState: TemplateLocationState = {
    line: 1,
    column: 2
  }

  if (raw.endsWith('`')) {
    end = raw.length - 1
  }

  if (loc !== null && typeof loc !== 'undefined') {
    locationState.line = loc.line
    locationState.column = loc.column + 1
  }

  while (index < end) {
    const part = raw[index]

    if (part === '\\') {
      text = text + raw.slice(index, Math.min(index + 2, end))
      advanceTemplateLocation(locationState, part)

      if (index + 1 < end) {
        advanceTemplateLocation(locationState, raw[index + 1])
      }

      index = index + 2
      continue
    }

    if (part === '$' && raw[index + 1] === '{') {
      if (text !== '') {
        parts.push({
          kind: 'text',
          value: text
        })
        text = ''
      }

      advanceTemplateLocation(locationState, '$')
      advanceTemplateLocation(locationState, '{')
      index = index + 2

      const placeholderStart = index
      const placeholderLoc = currentTemplateLocation(loc, locationState)
      let depth = 0
      let quote: string | null = null

      while (index < end) {
        const current = raw[index]

        if (quote !== null && typeof quote !== 'undefined') {
          advanceTemplateLocation(locationState, current)

          if (current === '\\' && index + 1 < end) {
            index = index + 1
            advanceTemplateLocation(locationState, raw[index])
          } else if (current === quote) {
            quote = null
          }

          index = index + 1
          continue
        }

        if (current === '"' || current === "'" || current === '`') {
          quote = current
          advanceTemplateLocation(locationState, current)
          index = index + 1
          continue
        }

        if (current === '{') {
          depth = depth + 1
          advanceTemplateLocation(locationState, current)
          index = index + 1
          continue
        }

        if (current === '}') {
          if (depth === 0) {
            break
          }

          depth = depth - 1
          advanceTemplateLocation(locationState, current)
          index = index + 1
          continue
        }

        advanceTemplateLocation(locationState, current)
        index = index + 1
      }

      if (index >= end) {
        pushStringDiagnostic(
          context,
          diagnostic('INOX_C_STRING_EXPR', 'unterminated template placeholder in C template literal', loc)
        )
        return parts
      }

      const placeholderRaw = raw.slice(placeholderStart, index)
      const placeholder = trimTemplatePlaceholder(placeholderRaw, placeholderLoc)

      parts.push({
        kind: 'placeholder',
        value: placeholder.value,
        loc: placeholder.loc
      })
      advanceTemplateLocation(locationState, '}')
      index = index + 1
      continue
    }

    text = text + part
    advanceTemplateLocation(locationState, part)
    index = index + 1
  }

  if (text !== '') {
    parts.push({
      kind: 'text',
      value: text
    })
  }

  return parts
}

export function cookTemplateLiteralText(value: string): string {
  let result = ''
  let index = 0

  while (index < value.length) {
    const unit = value[index]

    if (unit === '\\' && index + 1 < value.length) {
      index = index + 1
      result = result + templateEscapeValue(value[index])
    } else {
      result = result + unit
    }

    index = index + 1
  }

  return result
}

function templateEscapeValue(unit: string): string {
  if (unit === 'n') {
    return '\n'
  }

  if (unit === 't') {
    return '\t'
  }

  if (unit === 'r') {
    return '\r'
  }

  if (unit === 'f') {
    return '\f'
  }

  if (unit === 'v') {
    return '\v'
  }

  return unit
}

function currentTemplateLocation(loc: SourceLocation | undefined, state: TemplateLocationState): SourceLocation {
  return sourceLocationWithFile(loc, state.line, state.column)
}

function advanceTemplateLocation(state: TemplateLocationState, unit: string): void {
  if (unit === '\n') {
    state.line = state.line + 1
    state.column = 1
    return
  }

  state.column = state.column + 1
}

function trimTemplatePlaceholder(value: string, loc: SourceLocation): TrimmedTemplatePlaceholder {
  let index = 0
  let line = loc.line
  let column = loc.column

  while (index < value.length && isTemplateWhitespace(value[index])) {
    if (value[index] === '\n') {
      line = line + 1
      column = 1
    } else {
      column = column + 1
    }

    index = index + 1
  }

  const leadingTrimmed = value.slice(index)
  const trimmed = trimTemplateTrailingWhitespace(leadingTrimmed)

  return {
    value: trimmed,
    loc: sourceLocationWithFile(loc, line, column)
  }
}

function trimTemplateTrailingWhitespace(value: string): string {
  let end = value.length

  while (end > 0 && isTemplateWhitespace(value[end - 1])) {
    end = end - 1
  }

  return value.slice(0, end)
}

function isTemplateWhitespace(value: string): boolean {
  return value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f' || value === '\v'
}

export function collectTemplatePlaceholderExpressions(expression: AnyNode | null | undefined): AnyNode[] {
  if (
    expression === null ||
    typeof expression === 'undefined' ||
    expression.type !== 'TemplateLiteral' ||
    !expression.raw.includes('${')
  ) {
    return []
  }

  const diagnostics: Diagnostic[] = []
  const parts = parseTemplateLiteralParts(expression.raw, { diagnostics }, expression.loc)
  const result: AnyNode[] = []

  for (const part of parts) {
    if (part.kind !== 'placeholder' || part.value === '' || part.loc === null || typeof part.loc === 'undefined') {
      continue
    }

    const parsed = parseTemplatePlaceholderCaptureExpression(part.value, part.loc)

    if (parsed !== null && typeof parsed !== 'undefined') {
      result.push(parsed)
    }
  }

  return result
}

function parseTemplatePlaceholderCaptureExpression(value: string, loc: SourceLocation): AnyNode | null {
  const prefix = 'const __inox_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, tokenizeLocationOptions(loc)))
    const statement = program.body[0]
    let expression: AnyNode | null = null

    if (statement !== null && typeof statement !== 'undefined' && statement.type === 'VariableDeclaration') {
      expression = statement.init
    }

    if (program.body.length !== 1 || expression === null || typeof expression === 'undefined') {
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    return expression
  } catch (error) {
    const compileError = compileErrorOrNull(error)

    if (compileError !== null && typeof compileError !== 'undefined') {
      return null
    }

    throw error
  }
}

function parseTemplatePlaceholderExpression(
  value: string,
  loc: SourceLocation,
  context: StringCContext
): AnyNode | null {
  if (value === '') {
    pushStringDiagnostic(
      context,
      diagnostic('INOX_C_STRING_EXPR', 'empty template placeholder in C template literal', loc)
    )
    return null
  }

  const prefix = 'const __inox_template = '

  try {
    const program = parse(tokenize(`${prefix}${value}`, tokenizeLocationOptions(loc)))
    const statement = program.body[0]
    let expression: AnyNode | null = null

    if (statement !== null && typeof statement !== 'undefined' && statement.type === 'VariableDeclaration') {
      expression = statement.init
    }

    if (program.body.length !== 1) {
      pushStringDiagnostic(
        context,
        diagnostic('INOX_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    if (expression === null || typeof expression === 'undefined') {
      pushStringDiagnostic(
        context,
        diagnostic('INOX_C_STRING_EXPR', 'template placeholder must contain exactly one expression', loc)
      )
      return null
    }

    shiftTemplatePlaceholderExpressionLocations(expression, loc, prefix.length)

    if (validateTemplatePlaceholderExpressionReferences(expression, context)) {
      return expression
    }

    return null
  } catch (error) {
    const compileError = compileErrorOrNull(error)

    if (compileError !== null && typeof compileError !== 'undefined') {
      const first = compileError.diagnostics[0]
      let code = 'INOX_C_STRING_EXPR'
      let message = 'invalid template placeholder expression'

      if (compileError.diagnostics.length > 0) {
        code = first.code
        message = `invalid template placeholder expression: ${first.message}`
      }

      pushStringDiagnostic(context, diagnostic(code, message, loc))

      return null
    }

    throw error
  }
}

function validateTemplatePlaceholderExpressionReferences(expression: AnyNode | null, context: StringCContext): boolean {
  const reported: Set<string> = new Set()
  const state: TemplateReferenceValidationState = {
    context,
    reported,
    valid: true
  }

  visitTemplatePlaceholderValue(expression, null, '', state)

  return state.valid
}

function visitTemplatePlaceholderValue(
  value: AnyNode | AnyNode[] | null | undefined,
  parent: AnyNode | null,
  key: string,
  state: TemplateReferenceValidationState
): void {
  if (Array.isArray(value)) {
    const items: AnyNode[] = value

    for (const item of items) {
      visitTemplatePlaceholderValue(item, parent, key, state)
    }

    return
  }

  if (value === null || typeof value === 'undefined') {
    return
  }

  const node: AnyNode = value

  if (node.type === 'Reference') {
    const name = node.path[0]

    if (!isKnownTemplatePlaceholderReference(node, parent, key, state.context)) {
      reportUnknownTemplatePlaceholderReference(node, name, state)
    }
  }

  visitTemplatePlaceholderChildren(node, parent, key, state)
}

function reportUnknownTemplatePlaceholderReference(
  node: AnyNode,
  name: string,
  state: TemplateReferenceValidationState
): void {
  let line = 1
  let column = 1

  if (node.loc !== null && typeof node.loc !== 'undefined') {
    line = node.loc.line
    column = node.loc.column
  }

  const reportKey = `${name}:${line}:${column}`

  if (!state.reported.has(reportKey)) {
    state.reported.add(reportKey)
    pushStringDiagnostic(state.context, diagnostic('INOX_UNKNOWN_NAME', `unknown name ${name}`, node.loc))
  }

  state.valid = false
}

function visitTemplatePlaceholderChildren(
  node: AnyNode,
  _parent: AnyNode | null,
  _key: string,
  state: TemplateReferenceValidationState
): void {
  if (node.type === 'BinaryExpression') {
    visitTemplatePlaceholderValue(node.left, node, 'left', state)
    visitTemplatePlaceholderValue(node.right, node, 'right', state)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    visitTemplatePlaceholderValue(node.callee, node, 'callee', state)
    visitTemplatePlaceholderValue(node.args, node, 'args', state)
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    visitTemplatePlaceholderValue(node.object, node, 'object', state)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    visitTemplatePlaceholderValue(node.object, node, 'object', state)
    visitTemplatePlaceholderValue(node.index, node, 'index', state)
    return
  }

  if (
    node.type === 'AwaitExpression' ||
    node.type === 'UnaryExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'TypeAssertionExpression'
  ) {
    visitTemplatePlaceholderValue(node.argument, node, 'argument', state)
    visitTemplatePlaceholderValue(node.expression, node, 'expression', state)
    return
  }

  if (node.type === 'ArrayLiteral') {
    visitTemplatePlaceholderValue(node.elements, node, 'elements', state)
    return
  }

  if (node.type === 'ObjectLiteral') {
    visitTemplatePlaceholderValue(node.properties, node, 'properties', state)
    return
  }

  if (
    (node.type === null || typeof node.type === 'undefined') &&
    node.value !== null &&
    typeof node.value !== 'undefined'
  ) {
    visitTemplatePlaceholderValue(node.value, node, 'value', state)
  }
}

function isKnownTemplatePlaceholderReference(
  expression: AnyNode,
  parent: AnyNode | null,
  key: string,
  context: StringCContext
): boolean {
  const name = expression.path[0]
  const variables = context.variables

  if (variables !== null && typeof variables !== 'undefined' && variables.has(joinStrings(expression.path, '.'))) {
    return true
  }

  if (variables !== null && typeof variables !== 'undefined' && variables.has(name)) {
    return true
  }

  const functionNames = context.functionNames

  if (functionNames !== null && typeof functionNames !== 'undefined' && functionNames.has(name)) {
    return true
  }

  const jsGlobalRoots = context.jsGlobalRoots

  if (jsGlobalRoots !== null && typeof jsGlobalRoots !== 'undefined' && isCJsGlobalRoot(name, { jsGlobalRoots })) {
    return true
  }

  if (
    key === 'callee' &&
    parent !== null &&
    typeof parent !== 'undefined' &&
    parent.type === 'CallExpression' &&
    expression.path.length === 1
  ) {
    return name === 'Number' || name === 'String'
  }

  return false
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

function shiftTemplatePlaceholderExpressionLocations(
  value: AnyNode | AnyNode[] | null | undefined,
  loc: SourceLocation,
  prefixLength: number
): void {
  if (Array.isArray(value)) {
    const items: AnyNode[] = value

    for (const item of items) {
      shiftTemplatePlaceholderExpressionLocations(item, loc, prefixLength)
    }

    return
  }

  if (value === null || typeof value === 'undefined') {
    return
  }

  const node = value

  if (node.loc !== null && typeof node.loc !== 'undefined') {
    shiftTemplatePlaceholderLocation(node.loc, loc, prefixLength)
  }

  shiftTemplatePlaceholderChildLocations(node, loc, prefixLength)
}

function shiftTemplatePlaceholderLocation(target: SourceLocation, loc: SourceLocation, prefixLength: number): void {
  const lineOffset = target.line - 1

  target.line = loc.line + lineOffset

  if (lineOffset === 0) {
    target.column = loc.column + target.column - prefixLength - 1
  }

  target.file = ''
}

function shiftTemplatePlaceholderChildLocations(node: AnyNode, loc: SourceLocation, prefixLength: number): void {
  if (node.type === 'BinaryExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.left, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.right, loc, prefixLength)
    return
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.callee, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.args, loc, prefixLength)
    return
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.object, loc, prefixLength)
    return
  }

  if (node.type === 'IndexExpression' || node.type === 'OptionalIndexExpression') {
    shiftTemplatePlaceholderExpressionLocations(node.object, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.index, loc, prefixLength)
    return
  }

  if (
    node.type === 'AwaitExpression' ||
    node.type === 'UnaryExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'TypeAssertionExpression'
  ) {
    shiftTemplatePlaceholderExpressionLocations(node.argument, loc, prefixLength)
    shiftTemplatePlaceholderExpressionLocations(node.expression, loc, prefixLength)
    return
  }

  if (node.type === 'ArrayLiteral') {
    shiftTemplatePlaceholderExpressionLocations(node.elements, loc, prefixLength)
    return
  }

  if (node.type === 'ObjectLiteral') {
    shiftTemplatePlaceholderExpressionLocations(node.properties, loc, prefixLength)
    return
  }

  if (
    (node.type === null || typeof node.type === 'undefined') &&
    node.value !== null &&
    typeof node.value !== 'undefined'
  ) {
    shiftTemplatePlaceholderExpressionLocations(node.value, loc, prefixLength)
  }
}

export function isCStringRuntimeMethodName(name: string): boolean {
  return isStringRuntimeMethod(name)
}
