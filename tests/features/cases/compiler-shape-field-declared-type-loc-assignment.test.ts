// @targets c
// @expect pass
// @stdout string 1

import type { CompilerFieldMetadata } from './modules/compiler-anynode.ts'

function attachFieldMetadata(field: CompilerFieldMetadata): void {
  field.declaredType = 'string'
  field.loc = {
    line: 1,
    column: 1,
    file: 'input.ts'
  }
}

const field: CompilerFieldMetadata = {
  name: 'title',
  valueType: 'string'
}

attachFieldMetadata(field)
console.log(`${field.declaredType} ${field.loc.line}`)
