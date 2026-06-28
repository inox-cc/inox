// @targets cc
// @expect pass
// @stdout none

import { URLSearchParams } from 'node:url'
const params = new URLSearchParams('q=hello')
console.log(params.get('page') ?? 'none')
