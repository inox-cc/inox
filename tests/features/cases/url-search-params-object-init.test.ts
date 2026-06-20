// @targets c
// @expect pass
// @stdout q=hello

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams({ q: 'hello' })
console.log(params.toString())
