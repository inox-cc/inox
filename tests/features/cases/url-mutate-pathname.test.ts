// @targets c
// @expect pass
// @stdout https://example.com/next

import { URL } from 'node:url'
const page = new URL('https://example.com/start')
page.pathname = '/next'
console.log(page.href)
