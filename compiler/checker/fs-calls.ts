import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import type {
  FsBooleanOptions,
  FsRuntimeArgumentCheck,
  FsRuntimeCallPlan
} from '../stdlib/node/checker.ts'

export type CheckedFsValueInfo = {
  booleanLiteralValue?: boolean | null
  loc: SourceLocation
  nullable: boolean
  stringLiteralValue?: string | null
  type: string | undefined
  valueType: ValueType
}

export type CheckedFsObjectPropertyInfo = {
  key: string
  loc: SourceLocation
  value: CheckedFsValueInfo
}

export type CheckedFsArgInfo = CheckedFsValueInfo & {
  properties: CheckedFsObjectPropertyInfo[]
}

export type CheckedFsIndexedArgInfo = {
  arg: CheckedFsArgInfo
  index: number
}

export type CheckedFsCallInfo = {
  argCount: number
  args: CheckedFsIndexedArgInfo[]
}

export type FsCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: FsCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: FsCallCheckerContext,
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

export function checkFsCall(
  context: FsCallCheckerContext,
  expression: AnyNode,
  plan: FsRuntimeCallPlan,
  info: CheckedFsCallInfo
): void {
  if (plan.unsupportedMessage !== null && typeof plan.unsupportedMessage !== 'undefined') {
    report(context, 'INOX_FS_UNSUPPORTED', plan.unsupportedMessage, expression.loc)
    expression.valueType = 'unknown'

    return
  }

  if (info.argCount < plan.minArgs || info.argCount > plan.maxArgs) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function ${plan.label} expects ${plan.expectedArgsLabel} argument(s), got ${info.argCount}`,
      expression.loc
    )
  }

  checkFsRuntimeArguments(context, info, plan.argumentChecks)
}

function checkFsRuntimeArguments(
  context: FsCallCheckerContext,
  info: CheckedFsCallInfo,
  checks: FsRuntimeArgumentCheck[]
): FsBooleanOptions {
  const options: FsBooleanOptions = {}

  for (const check of checks) {
    if (check.kind === 'string') {
      checkFsStringArg(context, info, check.index)
    } else if (check.kind === 'number') {
      checkFsNumberArg(context, info, check.index)
    } else if (check.kind === 'utf8-encoding') {
      checkUtf8EncodingArg(context, info, check.index, check.label)
    } else if (check.kind === 'write-data') {
      options.bytes = checkFsWriteDataArg(context, info, check.index)
    } else if (check.kind === 'readdir-options') {
      options.withFileTypes = checkFsReaddirOptionsArg(context, info, check.index, check.label)
    } else if (
      check.kind === 'boolean-options' &&
      check.allowedOptions !== null &&
      typeof check.allowedOptions !== 'undefined'
    ) {
      const booleanOptions = checkFsBooleanOptionsArg(context, info, check.index, check.label, check.allowedOptions)

      if (booleanOptions.recursive === true) {
        options.recursive = true
      }

      if (booleanOptions.force === true) {
        options.force = true
      }

      if (booleanOptions.withFileTypes === true) {
        options.withFileTypes = true
      }
    }
  }

  return options
}

function checkedFsArgAt(info: CheckedFsCallInfo, index: number): CheckedFsArgInfo | null {
  for (const item of info.args) {
    if (item.index === index) {
      return item.arg
    }
  }

  return null
}

function checkFsWriteDataArg(context: FsCallCheckerContext, info: CheckedFsCallInfo, index: number): boolean {
  const arg = checkedFsArgAt(info, index)

  if (arg === null || typeof arg === 'undefined') {
    return false
  }

  if (arg.valueType === 'bytes') {
    return true
  }

  checkAssignableType(context, arg.valueType, 'string', arg.loc, false, arg.nullable)

  return false
}

function checkFsStringArg(context: FsCallCheckerContext, info: CheckedFsCallInfo, index: number): void {
  const arg = checkedFsArgAt(info, index)

  if (arg === null || typeof arg === 'undefined') {
    return
  }

  checkAssignableType(context, arg.valueType, 'string', arg.loc, false, arg.nullable)
}

function checkFsNumberArg(context: FsCallCheckerContext, info: CheckedFsCallInfo, index: number): void {
  const arg = checkedFsArgAt(info, index)

  if (arg === null || typeof arg === 'undefined') {
    return
  }

  checkAssignableType(context, arg.valueType, 'number', arg.loc, false, arg.nullable)
}

function checkUtf8EncodingArg(
  context: FsCallCheckerContext,
  info: CheckedFsCallInfo,
  index: number,
  label: string
): void {
  const arg = checkedFsArgAt(info, index)

  if (arg === null || typeof arg === 'undefined') {
    return
  }

  checkAssignableType(context, arg.valueType, 'string', arg.loc, false, arg.nullable)

  if (arg.type !== 'StringLiteral' || arg.stringLiteralValue !== 'utf8') {
    report(context, 'INOX_TYPE_MISMATCH', `${label} encoding must be 'utf8' in the MVP`, arg.loc)
  }
}

function checkFsReaddirOptionsArg(
  context: FsCallCheckerContext,
  info: CheckedFsCallInfo,
  index: number,
  label: string
): boolean {
  const arg = checkedFsArgAt(info, index)

  if (arg === null || typeof arg === 'undefined') {
    return false
  }

  if (arg.type === 'StringLiteral') {
    checkUtf8EncodingArg(context, info, index, label)

    return false
  }

  const options = checkFsBooleanOptionsArg(context, info, index, label, ['withFileTypes'])

  return options.withFileTypes === true
}

function checkFsBooleanOptionsArg(
  context: FsCallCheckerContext,
  info: CheckedFsCallInfo,
  index: number,
  label: string,
  allowed: string[]
): FsBooleanOptions {
  const arg = checkedFsArgAt(info, index)
  const result: FsBooleanOptions = {}

  if (arg === null || typeof arg === 'undefined') {
    return result
  }

  if (arg.type !== 'ObjectLiteral') {
    report(context, 'INOX_TYPE_MISMATCH', `${label} options must be an object literal in the current compiler slice`, arg.loc)

    return result
  }

  for (const property of arg.properties) {
    let allowedOption = false

    for (const allowedName of allowed) {
      if (property.key === allowedName) {
        allowedOption = true
        break
      }
    }

    if (!allowedOption) {
      report(context, 'INOX_UNKNOWN_FIELD', `unknown ${label} option ${property.key}`, property.loc)
      continue
    }

    const value = property.value

    if (value.valueType !== 'boolean' || value.type !== 'BooleanLiteral') {
      report(
        context,
        'INOX_TYPE_MISMATCH',
        `${label} option ${property.key} must be a boolean literal in the current compiler slice`,
        value.loc
      )
      continue
    }

    if (property.key === 'recursive') {
      result.recursive = value.booleanLiteralValue === true
    } else if (property.key === 'force') {
      result.force = value.booleanLiteralValue === true
    } else if (property.key === 'withFileTypes') {
      result.withFileTypes = value.booleanLiteralValue === true
    }
  }

  return result
}
