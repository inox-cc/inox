// @expect diagnostic
// @diagnostic INOX_MISSING_FIELD

type User = {
  id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1 }
  console.log(user)
}
