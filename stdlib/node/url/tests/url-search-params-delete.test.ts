// @targets cc
// @expect pass
// @stdout q=hello

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams('q=hello&page=1')
params.delete('page')
console.log(params.toString())
