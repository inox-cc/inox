// @targets js cc
// @expect pass
// @stdout 2 1 hello world

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('a=1&b=2&a=hello+world')
const values = params.getAll('a')
console.log(values.length, values[0], values[1])
