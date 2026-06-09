// @targets js,c
// @expect pass

import { greet as sayHello } from './util.ts'

export function main(): void {
  sayHello()
}
