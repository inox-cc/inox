// @targets cc
// @expect pass
// @stdout inline:6

import { distance } from './modules/inline-exported-function.ts'

console.log('inline:' + String(distance(-6)))
