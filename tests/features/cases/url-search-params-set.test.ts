// @targets c
// @expect pass
// @stdout q=hello&page=1

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams('q=hello')
params.set('page', '1')
console.log(params.toString())
