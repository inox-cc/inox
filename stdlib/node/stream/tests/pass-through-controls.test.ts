// @targets cc
// @expect pass
// @stdout 0 1 0
// @stdout closed
// @stdout 1

import { PassThrough } from 'node:stream'

const stream = new PassThrough()
const initial = stream.isPaused()
stream.pause()
const paused = stream.isPaused()
stream.resume()
console.log(initial, paused, stream.isPaused())

stream.on('close', () => {
  console.log('closed')
})
stream.destroy()
console.log(stream.destroyed)
