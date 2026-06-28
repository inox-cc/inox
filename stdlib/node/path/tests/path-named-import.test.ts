// @targets cc
// @expect pass
// @stdout b

import { basename } from 'node:path'
console.log(basename('/tmp/b'))
