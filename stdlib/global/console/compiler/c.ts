import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import type { AnyNode, IrProgram } from '../../../../compiler/types.ts'

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
  if (node === null || typeof node === 'undefined') {
    return false
  }

  if (isConsoleLog(node)) {
    return true
  }

  return containsConsoleRuntimeCallChildren(node)
}

function containsConsoleRuntimeCallChild(value: any): boolean {
  if (value === null || typeof value === 'undefined' || typeof value !== 'object') {
    return false
  }

  if (Array.isArray(value)) {
    return containsConsoleRuntimeCallList(value)
  }

  return containsConsoleRuntimeCall(value)
}

function containsConsoleRuntimeCallChildren(node: any): boolean {
  if (containsConsoleRuntimeCallChild(node.body)) return true
  if (containsConsoleRuntimeCallChild(node.params)) return true
  if (containsConsoleRuntimeCallChild(node.fields)) return true
  if (containsConsoleRuntimeCallChild(node.methods)) return true
  if (containsConsoleRuntimeCallChild(node.init)) return true
  if (containsConsoleRuntimeCallChild(node.condition)) return true
  if (containsConsoleRuntimeCallChild(node.consequent)) return true
  if (containsConsoleRuntimeCallChild(node.alternate)) return true
  if (containsConsoleRuntimeCallChild(node.test)) return true
  if (containsConsoleRuntimeCallChild(node.update)) return true
  if (containsConsoleRuntimeCallChild(node.iterable)) return true
  if (containsConsoleRuntimeCallChild(node.discriminant)) return true
  if (containsConsoleRuntimeCallChild(node.cases)) return true
  if (containsConsoleRuntimeCallChild(node.block)) return true
  if (containsConsoleRuntimeCallChild(node.handler)) return true
  if (containsConsoleRuntimeCallChild(node.finalizer)) return true
  if (containsConsoleRuntimeCallChild(node.argument)) return true
  if (containsConsoleRuntimeCallChild(node.args)) return true
  if (containsConsoleRuntimeCallChild(node.callee)) return true
  if (containsConsoleRuntimeCallChild(node.object)) return true
  if (containsConsoleRuntimeCallChild(node.index)) return true
  if (containsConsoleRuntimeCallChild(node.target)) return true
  if (containsConsoleRuntimeCallChild(node.value)) return true
  if (containsConsoleRuntimeCallChild(node.valueType)) return true
  if (containsConsoleRuntimeCallChild(node.functionType)) return true
  if (containsConsoleRuntimeCallChild(node.returnShape)) return true
  if (containsConsoleRuntimeCallChild(node.left)) return true
  if (containsConsoleRuntimeCallChild(node.right)) return true
  if (containsConsoleRuntimeCallChild(node.elements)) return true
  if (containsConsoleRuntimeCallChild(node.properties)) return true
  if (containsConsoleRuntimeCallChild(node.expression)) return true

  return false
}
