// @targets c
// @expect pass
// @stdout Ada

import type { User } from './modules/types.ts'
const user: User = { name: 'Ada' }
console.log(user.name)
