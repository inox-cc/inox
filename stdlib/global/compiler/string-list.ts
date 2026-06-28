export function globalStringListIncludes(values: string[], needle: string): boolean {
  for (const value of values) {
    if (value === needle) {
      return true
    }
  }

  return false
}
