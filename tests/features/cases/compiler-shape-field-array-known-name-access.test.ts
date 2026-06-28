// @targets cc
// @expect pass
// @stdout string

import type { CompilerAnyNode } from './modules/compiler-anynode.ts'

type WideFieldMetadata = {
  optional?: boolean
  ownership?: string
  readonlyField?: boolean
  declaredType?: string
  nullable?: boolean
  loc?: any
  arrayElementType?: string
  mapKeyType?: string
  mapValueType?: string
  setElementType?: string
  functionTypeOwnership?: string
  shapeOwnership?: string
  name: string
  valueType: string
  [key: string]: any
}

type WideShapeMetadata = {
  fields: WideFieldMetadata[]
  [key: string]: any
}

function findField(shape: WideShapeMetadata, expected: string): WideFieldMetadata | null {
  const fields: WideFieldMetadata[] = shape.fields

  for (const field of fields) {
    const label = `${field.name}`

    if (label === expected && field.name === expected) {
      return field
    }
  }

  return null
}

const shape: CompilerAnyNode = {
  fields: [
    {
      name: 'title',
      valueType: 'string'
    }
  ]
}

const field = findField(
  shape,
  'title'
)

if (field !== null) {
  console.log(field.valueType)
}
