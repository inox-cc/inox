// @targets cc
// @expect pass
// @stdout /a/c

import path from 'node:path'
console.log(path.posix.join('/a', 'b', '..', 'c'))
