// @targets cc
// @expect pass
// @stdout b/c

import path from 'node:path'
console.log(path.relative('/tmp/a', '/tmp/a/b/c'))
