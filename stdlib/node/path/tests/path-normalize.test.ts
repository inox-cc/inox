// @targets c
// @expect pass
// @stdout /tmp/b

import path from 'node:path'
console.log(path.normalize('/tmp/a/../b'))
