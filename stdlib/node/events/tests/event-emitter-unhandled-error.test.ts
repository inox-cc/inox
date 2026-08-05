// @targets cc
// @expect pass
// @stdout boom

import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()

try {
  emitter.emit('error', 'boom')
} catch (error) {
  console.log(error)
}
