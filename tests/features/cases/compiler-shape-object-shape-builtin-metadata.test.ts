// @targets c
// @expect pass
// @stdout regular

import type { CompilerObjectShapeInfo } from './modules/compiler-anynode.ts'

function isCompilerAnyNodeObjectShape(shape: CompilerObjectShapeInfo | null | undefined): boolean {
  return shape !== null && typeof shape !== 'undefined' && shape.builtin === 'compiler.AnyNode'
}

const shape: CompilerObjectShapeInfo = {
  kind: 'object',
  fields: []
}

if (isCompilerAnyNodeObjectShape(shape)) {
  console.log('any')
} else {
  console.log('regular')
}
