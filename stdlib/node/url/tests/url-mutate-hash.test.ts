// @targets cc
// @expect pass
// @stdout https://example.com/a#top

import { URL } from 'node:url'
const page = new URL('https://example.com/a')
page.hash = 'top'
console.log(page.href)
