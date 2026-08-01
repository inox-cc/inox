import type { AnyNode } from '../types.ts'
import { nodeNameEquals } from './resolved-types.ts'

export function hasWeakOwnershipMarker(fields: AnyNode[], fieldName: string): boolean {
  const markerName = `${fieldName}Ownership`

  for (const field of fields) {
    if (nodeNameEquals(field, markerName) && field.optional === true && field.valueType === 'string') {
      return true
    }
  }

  return false
}
