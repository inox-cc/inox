// @targets cc
// @expect pass
// @stdout once
// @stdout 0

import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()

emitter.once('ready', () => {
  console.log('once')
  emitter.emit('ready')
})
emitter.emit('ready')
emitter.emit('ready')
console.log(emitter.listenerCount('ready'))
