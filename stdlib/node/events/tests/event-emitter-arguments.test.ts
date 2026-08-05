// @targets cc
// @expect pass
// @stdout payload 42

import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()

emitter.on('value', (text, number) => {
  console.log(String(text), String(number))
})
emitter.emit('value', 'payload', 42)
