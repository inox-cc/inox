// @targets cc
// @expect pass
// @stdout set

import type { CompilerObjectShapeInfo } from './modules/compiler-anynode.ts'

function attachDynamicField(shape: CompilerObjectShapeInfo): void {
  shape.dynamicField = {
    name: 'item',
    valueType: 'unknown'
  }
}

const shape: CompilerObjectShapeInfo = {
  kind: 'object',
  fields: []
}

attachDynamicField(shape)

if (shape.dynamicField !== null && typeof shape.dynamicField !== 'undefined') {
  console.log('set')
}
