import type { AnyNode } from '../../types.ts'

export type RuntimeBackedFeatureNode = AnyNode & {
  args?: AnyNode[] | null
  binaryRuntimeMethod?: string | null
  callee?: AnyNode | null
  childProcessRuntimeMethod?: string | null
  cryptoRuntimeMethod?: string | null
  debugRuntimeMethod?: string | null
  elements?: AnyNode[] | null
  fsRuntimeConstant?: string | null
  fsRuntimeMethod?: string | null
  osRuntimeConstant?: string | null
  osRuntimeMethod?: string | null
  path?: string[]
  pathRuntimeConstant?: string | null
  pathRuntimeMethod?: string | null
  processRuntimeEnvName?: string | null
  processRuntimeMethod?: string | null
  processRuntimeProperty?: string | null
  property?: string | null
  returnType?: string | null
  timeRuntimeMethod?: string | null
  timerRuntimeMethod?: string | null
  type?: string | null
  urlRuntimeMethod?: string | null
  valueType?: string | null
}

export function hasStringValue(value: string | null | undefined): boolean {
  return value !== null && typeof value !== 'undefined'
}

export function isCallLikeNode(node: RuntimeBackedFeatureNode): boolean {
  return node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression'
}

export function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}

export function simpleReferencePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'Reference') {
    return null
  }

  const path = expression.path

  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return path
}
