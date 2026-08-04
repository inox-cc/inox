// @targets cc
// @expect pass
// @stdout alpha
// @stdout beta
// @stdout ended
// @stdout 1 1

import { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'

const stream = new PassThrough()

stream.on('data', (chunk) => {
  console.log(chunk.toString())
})
stream.once('end', () => {
  console.log('ended')
})

stream.write('alpha')
stream.end(Buffer.from('beta'))
console.log(stream.readableEnded, stream.writableEnded)
