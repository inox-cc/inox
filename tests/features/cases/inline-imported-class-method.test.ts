// @targets cc
// @expect pass
// @stdout imported-inline-class:11

import { Box } from './modules/inline-imported-class-method.ts'

const box = new Box(11)

console.log('imported-inline-class:' + String(box.read()))
