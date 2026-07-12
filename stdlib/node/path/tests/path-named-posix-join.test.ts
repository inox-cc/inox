// @targets cc
// @expect pass
// @stdout /a/c

import { posix } from 'node:path'
console.log(posix.join('/a', 'b', '..', 'c'))
