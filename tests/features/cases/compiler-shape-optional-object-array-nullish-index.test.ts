// @targets cc
// @expect pass
// @stdout first

import type { CompilerShapeCompatibilityMetadata } from './modules/compiler-shape-optional-array-metadata.d.ts'

function firstFieldName(metadata: CompilerShapeCompatibilityMetadata): string {
  const fields = metadata.shape?.fields ?? []

  if (fields.length > 0) {
    return fields[0].name
  }

  return ''
}

console.log(firstFieldName({ shape: { fields: [{ name: 'first' }] } }))
