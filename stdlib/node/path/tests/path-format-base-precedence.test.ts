// @targets cc
// @expect pass
// @stdout /tmp/base.md

import path from 'node:path'
console.log(path.format({ dir: '/tmp', base: 'base.md', name: 'name', ext: '.txt' }))
