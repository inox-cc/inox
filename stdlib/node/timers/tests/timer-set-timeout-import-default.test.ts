// @targets cc
// @expect pass
// @stdout default

import timers from 'node:timers'
timers.setTimeout(() => {
  console.log('default')
}, 0)
