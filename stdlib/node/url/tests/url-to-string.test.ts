// @targets js cc
// @expect pass
// @stdout https://example.com/path

import { URL } from 'node:url'

console.log(new URL('https://example.com/path').toString())
