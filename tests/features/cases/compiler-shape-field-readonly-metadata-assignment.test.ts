// @targets c
// @expect pass
// @stdout readonly

import type { CompilerFieldMetadata } from './modules/compiler-anynode.ts'

function attachReadonlyMetadata(field: CompilerFieldMetadata): void {
  field.readonly = true
}

const field: CompilerFieldMetadata = {
  name: 'title',
  valueType: 'string'
}

attachReadonlyMetadata(field)

if (field.readonly === true) {
  console.log('readonly')
}
