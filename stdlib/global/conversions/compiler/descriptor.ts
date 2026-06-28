import { globalStringListIncludes as stringListIncludes } from '../../compiler/string-list.ts'

export const numericCastNames = ['i32', 'u32', 'u64', 'f32', 'f64']

export function isNumericCastName(name: string | null | undefined): boolean {
  if (name === null || typeof name === 'undefined') {
    return false
  }

  return stringListIncludes(numericCastNames, name)
}
