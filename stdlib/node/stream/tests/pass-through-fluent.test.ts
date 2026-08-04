// @targets cc
// @expect pass
// @stdout fluent

import stream from 'node:stream'

const output = new stream.PassThrough()

output
  .on('data', (chunk) => {
    console.log(chunk.toString())
  })
  .end('fluent')
