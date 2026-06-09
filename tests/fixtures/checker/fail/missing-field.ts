// @expect diagnostic
// @diagnostic CCJS_MISSING_FIELD

type User = {
  id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1 }
  console.log(user)
}
