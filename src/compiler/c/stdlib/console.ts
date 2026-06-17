import { memberExpressionPath } from '../../member-paths.ts'
import type { IrProgram, AnyNode } from '../../types.ts'

const CONSOLE_RUNTIME_CHILD_KEYS = [
  'body',
  'params',
  'fields',
  'methods',
  'init',
  'condition',
  'consequent',
  'alternate',
  'test',
  'update',
  'iterable',
  'discriminant',
  'cases',
  'block',
  'handler',
  'finalizer',
  'argument',
  'args',
  'callee',
  'object',
  'index',
  'target',
  'value',
  'valueType',
  'functionType',
  'returnShape',
  'left',
  'right',
  'elements',
  'properties',
  'expression'
]

export function isConsoleLog(expression: AnyNode): boolean {
  if (expression.type !== 'CallExpression') {
    return false
  }

  return isConsoleRuntimePath(memberExpressionPath(expression.callee))
}

function isConsoleRuntimeProperty(property: string | null | undefined): boolean {
  return property === 'log' || property === 'info' || property === 'warn' || property === 'error'
}

function isConsoleRuntimePath(path: string[]): boolean {
  return path.length === 2 && path[0] === 'console' && isConsoleRuntimeProperty(path[1])
}

export function irProgramsUseConsoleRuntime(programs: IrProgram[]): boolean {
  for (let index = 0; index < programs.length; index = index + 1) {
    const program = programs[index]

    if (containsConsoleRuntimeCallList(program.body)) {
      return true
    }
  }

  return false
}

function containsConsoleRuntimeCallList(nodes: AnyNode[]): boolean {
  for (let index = 0; index < nodes.length; index = index + 1) {
    const node = nodes[index]

    if (containsConsoleRuntimeCall(node)) {
      return true
    }
  }

  return false
}

function containsConsoleRuntimeCall(node: AnyNode | null | undefined): boolean {
  if (node == null) {
    return false
  }

  if (isConsoleLog(node)) {
    return true
  }

  for (const key of CONSOLE_RUNTIME_CHILD_KEYS) {
    const value = node[key]

    if (value == null) {
      continue
    }

    if (Array.isArray(value)) {
      if (containsConsoleRuntimeCallList(value)) {
        return true
      }
      continue
    }

    if (containsConsoleRuntimeCall(value)) {
      return true
    }
  }

  return false
}
