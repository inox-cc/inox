// @targets c
// @platforms hosted,node
// @features fetch,fs,http,timers
// @expect diagnostic
// @diagnostic INOX_NOT_IMPLEMENTED

import fs from 'node:fs'

const response = await fetch('data:text/plain,hello')
const text = await response.text()

await fs.promises.writeFile('/private/tmp/inox-capability-smoke.txt', text)
const saved = await fs.promises.readFile('/private/tmp/inox-capability-smoke.txt', 'utf8')
const timeout = setTimeout(() => console.log(saved), 1)

clearTimeout(timeout)

const server = http.createServer((request, response) => {
  response.end(saved)
})

server.close()
