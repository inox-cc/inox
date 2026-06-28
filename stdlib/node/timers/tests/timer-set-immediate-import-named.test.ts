// @targets cc
// @expect pass
// @stdout named

import { setImmediate } from 'node:timers'
setImmediate(() => {
  console.log('named')
})
