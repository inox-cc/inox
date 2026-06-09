// @targets js
// @expect pass

function hello(): string {
  return 'called'
}

export function main(): void {
  const data = { items: [{ name: 'Ada' }], hello }
  const missing = null
  console.log(data?.items?.[0]?.name, missing?.items?.[0]?.name, data.hello?.())
}
