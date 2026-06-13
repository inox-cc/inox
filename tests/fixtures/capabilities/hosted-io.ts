// @targets js
// @platforms hosted,node
// @features fetch,fs,http,timers
// @expect pass

import fs from 'node:fs'

const response = await fetch('data:text/plain,hello')
const text = await response.text()

await fs.promises.writeFile('/private/tmp/ccjs-capability-smoke.txt', text)
const saved = await fs.promises.readFile('/private/tmp/ccjs-capability-smoke.txt', 'utf8')
const timeout = setTimeout(() => console.log(saved), 1)

clearTimeout(timeout)

const server = http.createServer((request, response) => {
  response.end(saved)
})

server.close()
