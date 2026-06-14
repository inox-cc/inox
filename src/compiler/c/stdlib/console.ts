import type { IrProgram, AnyNode } from '../../types.ts'

export function isConsoleLog(expression: any): boolean {
  return (
    expression?.type === 'CallExpression' &&
    expression.callee.type === 'MemberExpression' &&
    expression.callee.object.type === 'Reference' &&
    expression.callee.object.path.length === 1 &&
    expression.callee.object.path[0] === 'console' &&
    ['log', 'info', 'warn', 'error'].includes(expression.callee.property)
  )
}

export function irProgramsUseConsoleRuntime(programs: IrProgram[]): boolean {
  return programs.some((program) => containsConsoleRuntimeCall(program.body))
}

function containsConsoleRuntimeCall(node: unknown): boolean {
  if (node == null) {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(containsConsoleRuntimeCall)
  }

  if (typeof node !== 'object') {
    return false
  }

  if (isConsoleLog(node as AnyNode)) {
    return true
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'shape') {
      continue
    }

    if (containsConsoleRuntimeCall(value)) {
      return true
    }
  }

  return false
}
