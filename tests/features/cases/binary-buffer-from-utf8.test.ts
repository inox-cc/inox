// @targets c
// @expect pass
// @stdout hi

import { Buffer } from 'node:buffer'
console.log(Buffer.from('hi', 'utf8').toString('utf8'))
