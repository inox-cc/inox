// @targets cc
// @expect pass
// @stdout 1 0

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('%71=a+b&q=x')
console.log(params.has('q', 'a b'), params.has('q', 'missing'))
