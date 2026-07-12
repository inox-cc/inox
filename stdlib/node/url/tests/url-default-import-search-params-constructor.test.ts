// @targets cc
// @expect pass
// @stdout q=inox

import url from 'node:url'
const params = new url.URLSearchParams('q=inox')
console.log(params.toString())
