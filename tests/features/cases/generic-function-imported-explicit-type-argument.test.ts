// @targets cc
// @expect pass
// @stdout ADA

import { identity } from './modules/generic-function.ts'

const value = identity<string>('Ada')
console.log(value.toUpperCase())
