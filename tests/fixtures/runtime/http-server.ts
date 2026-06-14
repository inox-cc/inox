// @targets c
// @expect diagnostic
// @diagnostic CCJS_NOT_IMPLEMENTED

const server = http.createServer((request, response) => {
  response.end('ok')
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

const address = server.address()
const response = await fetch(`http://127.0.0.1:${address.port}`)
const text = await response.text()
server.close()

console.log(text)
