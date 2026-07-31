// @targets cc
// @expect pass
// @stdout ADA

import { identity } from './modules/generic-function'

const value = identity('Ada')
console.log(value.toUpperCase())
