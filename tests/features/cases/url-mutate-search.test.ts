// @targets c
// @expect pass
// @stdout https://example.com/a?q=1

import { URL } from 'node:url'
const page = new URL('https://example.com/a')
page.search = 'q=1'
console.log(page.href)
