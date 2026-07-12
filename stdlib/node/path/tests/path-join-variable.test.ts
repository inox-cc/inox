// @targets cc
// @expect pass
// @stdout /tmp/a

import { join } from 'node:path'

const joined = join('/tmp', 'a')
console.log(joined)
