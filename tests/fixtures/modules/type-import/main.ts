// @targets js,c
// @expect pass

import type { User as Person } from './types.ts'

export function main(): void {
  const user: Person = { name: 'Ada' }
  console.log(user.name)
}
