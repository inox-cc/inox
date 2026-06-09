// @targets js
// @expect pass

export function main(): void {
  const user = JSON.parse('{"name":"Ada"}')
  const text = JSON.stringify(user)
  const bytes = Buffer.from('hi', 'utf8')
  const typed = new Uint8Array([1, 2, 3])

  console.log(user.name, text.includes('Ada'), bytes.length, typed[2], Math.max(2, 3))
}
