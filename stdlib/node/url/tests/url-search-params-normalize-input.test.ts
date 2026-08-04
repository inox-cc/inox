// @targets cc
// @expect pass
// @stdout q=a+b&x=%7E&bare=

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('?q=a b&x=~&&bare')
console.log(params.toString())
