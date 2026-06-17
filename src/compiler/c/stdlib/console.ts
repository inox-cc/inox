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
  return (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.object.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    expression.callee.object.path[0] === 'console' &&
    isConsoleRuntimeProperty(expression.callee.property)
  )
}

function isConsoleRuntimeProperty(property: string | null | undefined): boolean {
  return property === 'log' || property === 'info' || property === 'warn' || property === 'error'
}

export function irProgramsUseConsoleRuntime(programs: IrProgram[]): boolean {
  for (const program of programs) {
    if (containsConsoleRuntimeCallList(program.body)) {
      return true
    }
  }

  return false
}

function containsConsoleRuntimeCallList(nodes: AnyNode[]): boolean {
  for (const node of nodes) {
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
