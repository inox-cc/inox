// @targets cc
// @expect pass
// @stdout file:///tmp/a%20b

import { pathToFileURL } from 'node:url'
const file = pathToFileURL('/tmp/a b')
console.log(file.href)
