// @targets cc
// @expect pass
// @stdout file:///tmp/a

import url from 'node:url'
const file = url.pathToFileURL('/tmp/a')
console.log(file.href)
