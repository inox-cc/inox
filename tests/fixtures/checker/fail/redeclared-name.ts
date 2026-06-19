// @expect diagnostic
// @diagnostic INOX_REDECLARED_NAME

export function main(): void {
  const value = 1
  const value = 2
}
