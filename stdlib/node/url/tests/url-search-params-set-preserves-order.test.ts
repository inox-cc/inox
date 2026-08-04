// @targets js cc
// @expect pass
// @stdout a=4&b=2

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('a=1&b=2&a=3')
params.set('a', '4')
console.log(params.toString())
