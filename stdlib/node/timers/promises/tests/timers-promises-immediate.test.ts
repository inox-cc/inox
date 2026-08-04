// @targets cc
// @expect pass
// @stdout sync
// @stdout later

import timers from 'node:timers/promises'

const pending = timers.setImmediate('later')
console.log('sync')
console.log(await pending)
