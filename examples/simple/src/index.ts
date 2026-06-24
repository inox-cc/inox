console.log('hello world')
console.log(Date.now())

// try {
//   const res = await fetch('https://example.com/')
//   console.log('Status', res.status)
//   const txt = await res.text()
//   console.log('Text', txt)
// } catch (error) {
//   console.log('#error:', error)
// }

try {
  const foo = JSON.parse('{"v":{"1":2},{"3":4,"5":6}]}') // bad json
  console.log(foo)
} catch (e) {
  console.error('Error', e)
}

const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":6}]}')

console.log(Array.isArray(foo))

console.log(Object.entries(foo.v))

for (const a of foo.v) {
  console.log(a)

  const b = Object.values(a)
  console.log(b)

  const c = Object.values(a)[0]
  console.log(c)

  const d = Object.entries(a)
  console.log(d)

  const e = Object.entries(a)[0]
  console.log(e)
}
