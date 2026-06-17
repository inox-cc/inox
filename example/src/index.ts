console.log('hello world')

// try {
//   const res = await fetch('https://example.com/')
//   console.log('Status', res.status)
//   const txt = await res.text()
//   console.log('Text', txt)
// } catch (error) {
//   console.log('#error:', error)
// }

const foo = [{ '1': 2 }, { '3': 4, '5': 6 }]

for (const a of foo) {
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
