// @targets cc
// @expect pass
// @stdout 1
// @stdout inherited

import { PassThrough } from 'node:stream'

const stream = new PassThrough()

stream.on('data', (chunk) => {
  console.log(chunk.toString())
})
console.log(stream.listenerCount('data'))
stream.end('inherited')
