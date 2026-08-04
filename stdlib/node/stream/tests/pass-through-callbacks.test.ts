// @targets cc
// @expect pass
// @stdout chunk
// @stdout written
// @stdout finished

import { PassThrough } from 'node:stream'

const stream = new PassThrough()

stream.on('data', (chunk) => {
  console.log(chunk.toString())
})
stream.write('chunk', () => {
  console.log('written')
})
stream.end(() => {
  console.log('finished')
})
