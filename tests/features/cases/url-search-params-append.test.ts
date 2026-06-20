// @targets c
// @expect pass
// @stdout q=hello&page=1

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams('q=hello')
params.append('page', '1')
console.log(params.toString())
