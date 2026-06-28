// @targets cc
// @expect pass
// @stdout /tmp/a b

import { fileURLToPath } from 'node:url'
console.log(fileURLToPath('file:///tmp/a%20b'))
