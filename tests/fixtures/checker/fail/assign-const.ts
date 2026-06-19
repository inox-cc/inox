// @expect diagnostic
// @diagnostic INOX_ASSIGN_CONST

export function main(): void {
  const value = 1
  value = 2
}
