// @targets cc
// @expect pass
// @stdout 0 16384
// @stdout 16384
// @stdout drained

import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'

const stream = new PassThrough()
const accepted = stream.write(Buffer.alloc(16384))
console.log(accepted, stream.readableLength)

stream.on('drain', () => {
  console.log('drained')
})
stream.on('data', (chunk) => {
  console.log(chunk.length)
})
