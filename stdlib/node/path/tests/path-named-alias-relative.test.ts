// @targets cc
// @expect pass
// @stdout b

import { relative as rel } from 'node:path'
console.log(rel('/tmp/a', '/tmp/a/b'))
