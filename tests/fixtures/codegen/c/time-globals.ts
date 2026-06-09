// @targets c
// @expect pass

export function main(): void {
  const started = Date.now()
  const elapsed = performance.now()
  console.log(started >= 0, elapsed >= 0)
}
