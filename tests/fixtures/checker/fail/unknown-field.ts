// @expect diagnostic
// @diagnostic CCJS_UNKNOWN_FIELD

type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 1, extra: true }
  console.log(user)
}
