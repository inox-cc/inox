// @targets cc
// @expect pass
// @stdout /tmp/a

import path from 'node:path'
console.log(path.dirname('/tmp/a/file.txt'))
