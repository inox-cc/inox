// @expect diagnostic
// @diagnostic INOX_AWAIT_OUTSIDE_ASYNC

export function main(): void {
  const value = await Promise.resolve(1)
  console.log(value)
}
