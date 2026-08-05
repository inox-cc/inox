// @targets cc
// @expect pass
// @stdout called
// @stdout 1

import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()
const listener = () => {
  console.log('called')
}

emitter.on('ready', listener)
emitter.on('ready', listener)
emitter.removeListener('ready', listener)
emitter.emit('ready')
console.log(emitter.listenerCount('ready'))
