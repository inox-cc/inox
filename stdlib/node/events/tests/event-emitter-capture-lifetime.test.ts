// @targets cc
// @expect pass
// @stdout captured

import { EventEmitter } from 'node:events'

function register(emitter: EventEmitter): void {
  const message = 'captured'
  emitter.on('ready', () => {
    console.log(message)
  })
}

const emitter = new EventEmitter()
register(emitter)
emitter.emit('ready')
