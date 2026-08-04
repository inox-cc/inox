// @targets cc
// @expect pass
// @stdout q=2&x=3

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('q=1&q=2&q=1&x=3')
params.delete('q', '1')
console.log(params.toString())
