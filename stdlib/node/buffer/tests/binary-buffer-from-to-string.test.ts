// @targets cc
// @expect pass
// @stdout hi

import { Buffer } from 'node:buffer'
const bytes = Buffer.from('hi')
console.log(bytes.toString())
