import type { ValueType } from '../../../compiler/types.ts'

export function runtimeImportValueType(_source: string, _importedName: string): ValueType {
  return 'unknown'
}
