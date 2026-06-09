// @targets c
// @expect pass
// @stdout Ada

export function main(): void {
  const data = { name: 'Ada' }
  console.log(data?.name)
}
