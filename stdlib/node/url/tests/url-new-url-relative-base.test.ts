// @targets cc
// @expect pass
// @stdout https://example.com/root/next?q=1

import { URL } from 'node:url'
const base = new URL('https://example.com/root/file')
const page = new URL('next?q=1', base)
console.log(page.href)
