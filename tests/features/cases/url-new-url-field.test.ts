// @targets c
// @expect pass
// @stdout example.com

import { URL } from 'node:url'
const page = new URL('https://example.com/a?b=1#top')
console.log(page.hostname)
