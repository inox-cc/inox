// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_JS_GLOBAL

const server = http.createServer((request, response) => {
  response.end('ok')
})
console.log(server)

