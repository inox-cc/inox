// @targets cc
// @expect pass
// @stdout 0 0

import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()
const listener = () => {
  console.log('unexpected')
}

emitter.addListener('first', listener)
emitter.off('first', listener)
emitter.on('second', listener)
emitter.removeAllListeners('second')
emitter.on('third', listener)
emitter.removeAllListeners()
console.log(emitter.listenerCount('second'), emitter.listenerCount('third'))
