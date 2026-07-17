// @targets cc
// @expect pass
// @stdout missing

import type { CompilerShapeMapContext } from './modules/compiler-shape-map-context.d.ts'

function isCompiler(value: string): boolean {
  return value === 'compiler'
}

function hasMissingValue(context: CompilerShapeMapContext): boolean {
  const value = context.values.get('missing')

  return isCompiler(context.marker) && value !== 'present'
}

const context: CompilerShapeMapContext = {
  marker: 'compiler',
  nullableValues: new Map(),
  values: new Map()
}

if (hasMissingValue(context)) {
  console.log('missing')
}
