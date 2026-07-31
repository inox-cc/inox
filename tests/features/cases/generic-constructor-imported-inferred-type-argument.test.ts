// @targets cc
// @expect pass
// @stdout ADA

import { Box } from './modules/generic-class'

const box = new Box('Ada')
console.log(box.value.toUpperCase())
