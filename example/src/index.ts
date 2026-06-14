console.log('hello world')

try {
  const res = await fetch('https://example.com/')
  console.log('Status', res.status)
  const txt = await res.text()
  console.log('Text', txt)
} catch (error) {
  console.log('#error:', error)
}
