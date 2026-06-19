// @expect diagnostic
// @diagnostic INOX_TYPE_MISMATCH

type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 'Ada' }
  console.log(user)
}
