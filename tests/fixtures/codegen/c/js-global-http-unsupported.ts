// @targets c
// @expect diagnostic
// @diagnostic INOX_C_JS_GLOBAL

const server = http.createServer((request, response) => {
  response.end('ok')
})
console.log(server)

