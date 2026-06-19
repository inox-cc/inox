// @expect diagnostic
// @diagnostic INOX_ARG_COUNT

function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet()
}
