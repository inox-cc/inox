// @targets cc
// @expect pass
// @stdout value
// @stdout class:item

import type { CompilerShapeMapContext } from './modules/compiler-shape-map-context.d.ts'

type LocalMapContext = CompilerShapeMapContext

function readNullable(context: LocalMapContext): string | null {
  const value = context.nullableValues.get('item')

  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function hasClassValue(context: LocalMapContext): boolean {
  const value = context.values.get('item')

  return value !== null && typeof value !== 'undefined' && value.startsWith('class:')
}

const context: LocalMapContext = {
  marker: 'compiler',
  nullableValues: new Map(),
  values: new Map()
}

context.nullableValues.set('item', 'value')
context.values.set('item', 'class:item')
console.log(readNullable(context))

if (hasClassValue(context)) {
  console.log(context.values.get('item'))
}
