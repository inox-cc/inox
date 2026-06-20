// @targets c
// @expect pass
// @stdout /tmp/b

import path from 'node:path'
console.log(path.join('/tmp', 'a', '..', 'b'))
