import type { AnyNode } from '../types.ts'

export type JsEmitOptions = {
  callMain?: boolean
  stripExports?: boolean
}

export function emitFunctionParams(params: AnyNode[], options: JsEmitOptions = {}): string {
  return params.map((param) => param.name).join(', ')
}

export function emitReturnTypeAnnotation(node: AnyNode, options: JsEmitOptions = {}): string {
  return ''
}

export function emitVariableTypeAnnotation(statement: AnyNode, options: JsEmitOptions = {}): string {
  return ''
}

export function emitTypeAlias(statement: AnyNode, options: JsEmitOptions = {}): string[] {
  return []
}

export function emitArrowFunctionParams(expression: AnyNode, options: JsEmitOptions = {}): string {
  return expression.params.length === 1
    ? expression.params[0].name
    : `(${expression.params.map((param) => param.name).join(', ')})`
}

export function emitArrowReturnTypeAnnotation(expression: AnyNode, options: JsEmitOptions = {}): string {
  return ''
}
