// @targets cc
// @expect pass
// @stdout /:

import { sep, delimiter } from 'node:path'
console.log(sep + delimiter)
