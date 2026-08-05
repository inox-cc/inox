// @targets cc
// @expect pass
// @stdout first
// @stdout second
// @stdout 1 0

import events from 'node:events'

const emitter = new events.EventEmitter()

emitter.on('ready', () => {
  console.log('first')
})
emitter.on('ready', () => {
  console.log('second')
})

console.log(emitter.emit('ready'), emitter.emit('missing'))
