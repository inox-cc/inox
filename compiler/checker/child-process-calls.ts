import { diagnostic } from '../diagnostics.ts'
import type { AnyNode, Diagnostic, SourceLocation, ValueType } from '../types.ts'
import { isAssignableType } from './assignability.ts'
import { childProcessSpawnSyncResultShape } from './builtins.ts'

type ChildProcessRuntimeCall = {
  label: string
  method: string
  unsupported?: boolean
}

export type CheckedChildProcessValueInfo = {
  loc: SourceLocation
  node: AnyNode
  valueType: ValueType
}

export type CheckedChildProcessArgsInfo = {
  elements: CheckedChildProcessValueInfo[]
  node: AnyNode
}

export type CheckedChildProcessOptionInfo = {
  envProperties: CheckedChildProcessEnvPropertyInfo[]
  key: string
  loc: SourceLocation
  value: AnyNode
  valueType: ValueType
}

export type CheckedChildProcessEnvPropertyInfo = {
  key: string
  loc: SourceLocation
  value: AnyNode
  valueType: ValueType
}

export type CheckedChildProcessOptionsInfo = {
  node: AnyNode | null
  properties: CheckedChildProcessOptionInfo[]
}

export type CheckedChildProcessCallInfo = {
  args: CheckedChildProcessArgsInfo | null
  firstArg: CheckedChildProcessValueInfo | null
  options: CheckedChildProcessOptionsInfo | null
  topLevelArgs: CheckedChildProcessValueInfo[]
}

export type ChildProcessCallCheckerContext = {
  diagnostics: Diagnostic[]
}

function report(context: ChildProcessCallCheckerContext, code: string, message: string, loc: SourceLocation): void {
  context.diagnostics.push(diagnostic(code, message, loc))
}

function checkAssignableType(
  context: ChildProcessCallCheckerContext,
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

export function checkChildProcessCall(
  context: ChildProcessCallCheckerContext,
  expression: AnyNode,
  call: ChildProcessRuntimeCall,
  info: CheckedChildProcessCallInfo
): ValueType {
  if (call.unsupported) {
    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:child_process ${call.method} is not implemented by the current C backend`,
      expression.loc
    )
    expression.valueType = 'unknown'
    return 'unknown'
  }

  if (call.method === 'execSync') {
    if (expression.args.length !== 2) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 2 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (info.firstArg !== null && typeof info.firstArg !== 'undefined') {
      checkAssignableType(context, info.firstArg.valueType, 'string', info.firstArg.loc, false, false)
    }

    checkChildProcessSyncOptions(context, info.options, expression.loc, true)
    expression.childProcessRuntimeMethod = call.method
    expression.valueType = 'string'

    return 'string'
  }

  if (call.method === 'execFileSync') {
    if (expression.args.length < 2 || expression.args.length > 3) {
      report(
        context,
        'INOX_ARG_COUNT',
        `function ${call.label} expects 2 or 3 argument(s), got ${expression.args.length}`,
        expression.loc
      )
    }

    if (info.firstArg !== null && typeof info.firstArg !== 'undefined') {
      checkAssignableType(context, info.firstArg.valueType, 'string', info.firstArg.loc, false, false)
    }

    checkChildProcessArgs(context, info.args, 'execFileSync')
    checkChildProcessSyncOptions(context, info.options, expression.loc, true)
    expression.childProcessRuntimeMethod = call.method
    expression.valueType = 'string'

    return 'string'
  }

  if (expression.args.length < 1 || expression.args.length > 3) {
    report(
      context,
      'INOX_ARG_COUNT',
      `function ${call.label} expects 1 to 3 argument(s), got ${expression.args.length}`,
      expression.loc
    )
  }

  if (info.firstArg !== null && typeof info.firstArg !== 'undefined') {
    checkAssignableType(context, info.firstArg.valueType, 'string', info.firstArg.loc, false, false)
  }

  checkChildProcessArgs(context, info.args, 'spawnSync')
  checkChildProcessSyncOptions(context, info.options, expression.loc, true)
  expression.childProcessRuntimeMethod = call.method
  expression.valueType = 'object'
  expression.shape = childProcessSpawnSyncResultShape

  return 'object'
}

function checkChildProcessArgs(
  context: ChildProcessCallCheckerContext,
  args: CheckedChildProcessArgsInfo | null,
  method: string
): void {
  if (args === null || typeof args === 'undefined') {
    return
  }

  if (args.node.type !== 'ArrayLiteral') {
    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:child_process ${method} currently expects a string[] literal args argument`,
      args.node.loc
    )
    return
  }

  for (let index = 0; index < args.elements.length; index = index + 1) {
    const element = args.elements[index]

    checkAssignableType(context, element.valueType, 'string', element.loc, false, false)
  }
}

function checkChildProcessSyncOptions(
  context: ChildProcessCallCheckerContext,
  options: CheckedChildProcessOptionsInfo | null,
  loc: SourceLocation,
  requireEncoding: boolean
): void {
  if (
    options === null ||
    typeof options === 'undefined' ||
    options.node === null ||
    typeof options.node === 'undefined' ||
    options.node.type !== 'ObjectLiteral'
  ) {
    let reportLoc = loc

    if (
      options !== null &&
      typeof options !== 'undefined' &&
      options.node !== null &&
      typeof options.node !== 'undefined'
    ) {
      reportLoc = options.node.loc
    }

    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      'node:child_process sync helpers currently require { encoding: "utf8" }',
      reportLoc
    )
    return
  }

  let encoding: CheckedChildProcessOptionInfo | null = null

  for (let index = 0; index < options.properties.length; index = index + 1) {
    const property = options.properties[index]

    if (property.key === 'encoding') {
      encoding = property
      break
    }
  }

  if (
    requireEncoding &&
    (encoding === null ||
      typeof encoding === 'undefined' ||
      encoding.value.type !== 'StringLiteral' ||
      encoding.value.value !== 'utf8')
  ) {
    let reportLoc = options.node.loc

    if (encoding !== null && typeof encoding !== 'undefined') {
      reportLoc = encoding.value.loc
    }

    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      'node:child_process sync helpers currently support only { encoding: "utf8" }',
      reportLoc
    )
  }

  for (let index = 0; index < options.properties.length; index = index + 1) {
    const property = options.properties[index]

    if (property.key === 'encoding') {
      continue
    }

    if (property.key === 'cwd') {
      checkAssignableType(context, property.valueType, 'string', property.value.loc, false, false)
      continue
    }

    if (property.key === 'stdio') {
      if (
        property.value.type !== 'StringLiteral' ||
        (property.value.value !== 'pipe' && property.value.value !== 'ignore')
      ) {
        report(
          context,
          'INOX_NOT_IMPLEMENTED',
          "node:child_process sync helpers currently support stdio: 'pipe' or 'ignore'",
          property.value.loc
        )
      }
      continue
    }

    if (property.key === 'timeout') {
      checkAssignableType(context, property.valueType, 'number', property.value.loc, false, false)
      continue
    }

    if (property.key === 'env') {
      if (property.value.type !== 'ObjectLiteral') {
        report(
          context,
          'INOX_NOT_IMPLEMENTED',
          'node:child_process sync helpers currently expect env to be an object literal',
          property.value.loc
        )
        continue
      }

      for (let envIndex = 0; envIndex < property.envProperties.length; envIndex = envIndex + 1) {
        const envProperty = property.envProperties[envIndex]

        checkAssignableType(context, envProperty.valueType, 'string', envProperty.value.loc, false, false)
      }
      continue
    }

    report(
      context,
      'INOX_NOT_IMPLEMENTED',
      `node:child_process sync option ${property.key} is not implemented by the current C backend`,
      property.loc
    )
  }
}
