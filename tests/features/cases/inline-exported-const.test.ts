// @targets cc
// @expect pass
// @stdout inline-const:7

import { increment } from './modules/inline-exported-const.ts'

console.log('inline-const:' + String(increment(6)))
