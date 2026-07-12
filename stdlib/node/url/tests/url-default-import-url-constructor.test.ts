// @targets cc
// @expect pass
// @stdout example.com

import url from 'node:url'
const page = new url.URL('https://example.com/docs')
console.log(page.hostname)
