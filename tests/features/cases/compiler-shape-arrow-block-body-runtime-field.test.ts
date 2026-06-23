// @targets c
// @expect pass
// @stdout function:0:none

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

type FunctionTypeMetadata = {
  kind: string
  resolved: boolean
  params: CompilerAnyNode[]
  returnType?: string | null
  returnShape?: CompilerAnyNode | null
}

function resolveParams(params: CompilerAnyNode[] | null | undefined): CompilerAnyNode[] {
  if (params === null || typeof params === 'undefined') {
    return []
  }

  return params
}

function inferArrowFunctionTypeMetadata(expression: CompilerAnyNode): FunctionTypeMetadata {
  let returnShape: CompilerAnyNode | null = null

  if (
    expression.body !== null &&
    typeof expression.body !== 'undefined' &&
    expression.body.shape !== null &&
    typeof expression.body.shape !== 'undefined'
  ) {
    returnShape = expression.body.shape
  }

  return {
    kind: 'function',
    resolved: true,
    params: resolveParams(expression.params),
    returnType: expression.returnType,
    returnShape
  }
}

const expression: CompilerAnyNode = {
  type: 'ArrowFunctionExpression',
  params: [],
  returnType: 'void',
  body: []
}

const metadata = inferArrowFunctionTypeMetadata(expression)
const shape = metadata.returnShape === null || typeof metadata.returnShape === 'undefined' ? 'none' : 'shape'

console.log(`${metadata.kind}:${metadata.params.length}:${shape}`)
