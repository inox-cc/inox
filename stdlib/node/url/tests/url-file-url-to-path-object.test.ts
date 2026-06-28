// @targets c
// @expect pass
// @stdout /tmp/a b

import { URL, fileURLToPath } from 'node:url'
const file = new URL('file:///tmp/a%20b')
console.log(fileURLToPath(file))
