// @targets cc
// @expect pass
// @stdout /tmp/file.txt

import path from 'node:path'
console.log(path.format({ dir: '/tmp', name: 'file', ext: '.txt' }))
