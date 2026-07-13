// @targets cc
// @expect pass
// @stdout second

import type { ObjectShapeField } from './modules/compiler-object-shape-field.ts'

function findName(
  primary: Map<string, ObjectShapeField[]>,
  fallback: Map<string, ObjectShapeField[]>,
  expected: string
): string {
  const items = primary.get(expected) ?? fallback.get(expected)

  if (items === null || typeof items === 'undefined') {
    return 'missing'
  }

  for (let index = 0; index < items.length; index = index + 1) {
    if (items[index].name === expected) {
      return items[index].name
    }
  }

  return 'missing'
}

console.log(
  findName(
    new Map<string, ObjectShapeField[]>(),
    new Map<string, ObjectShapeField[]>([
      [
        'second',
        [
          { name: 'first', valueType: 'string' },
          { name: 'second', valueType: 'string' }
        ]
      ]
    ]),
    'second'
  )
)
