// @targets js cc
// @expect pass
// @stdout 3

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('a=1&b=2&a=3')
console.log(params.size)
