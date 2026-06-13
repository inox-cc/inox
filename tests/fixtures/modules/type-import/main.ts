// @targets js,c
// @expect pass

import type { User as Person } from './types.ts'

const user: Person = { name: 'Ada' }
console.log(user.name)
