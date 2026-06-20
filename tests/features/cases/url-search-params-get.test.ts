// @targets c
// @expect pass
// @stdout hello world

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams('q=hello+world')
console.log(params.get('q') ?? '')
