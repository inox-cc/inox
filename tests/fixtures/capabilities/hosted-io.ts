// @targets js,ts
// @platforms hosted,node
// @features fetch,fs,http,timers
// @expect pass

export async function main(): void {
  const response = await fetch('data:text/plain,hello')
  const text = await response.text()

  await fs.writeFile('/private/tmp/ccjs-capability-smoke.txt', text)
  const saved = await fs.readFile('/private/tmp/ccjs-capability-smoke.txt', 'utf8')
  const timeout = setTimeout(() => console.log(saved), 1)

  clearTimeout(timeout)

  const server = http.createServer((request, response) => {
    response.end(saved)
  })

  server.close()
}
