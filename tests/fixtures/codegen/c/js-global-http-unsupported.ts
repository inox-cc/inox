// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_JS_GLOBAL

export function main(): void {
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  console.log(server)
}
