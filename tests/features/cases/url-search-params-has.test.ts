// @targets c
// @expect pass
// @stdout 1

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams('q=hello')
console.log(params.has('q'))
