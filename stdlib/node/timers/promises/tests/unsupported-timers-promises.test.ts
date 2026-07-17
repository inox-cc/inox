// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_IMPORT_SOURCE

import timers from 'node:timers/promises'
console.log(timers)
