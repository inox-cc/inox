// @targets js cc
// @expect pass
// @stdout a=1&b=2

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('a=1')
params.set('b', '2')
console.log(params.toString())
