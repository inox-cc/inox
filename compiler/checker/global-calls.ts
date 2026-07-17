import type { TypeRef } from '../extensions/types.ts'
import type { ObjectShapeInfo, SourceLocation, ValueType } from '../types.ts'

export type CheckedCallArgInfo = {
  valueType: ValueType
  nullable: boolean
  loc: SourceLocation
  shape: ObjectShapeInfo | null
  typeRef: TypeRef
}
