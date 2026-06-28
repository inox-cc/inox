import type { ValueType } from '../../types.ts'

export function runtimeImportValueType(_source: string, _importedName: string): ValueType {
  return 'unknown'
}
