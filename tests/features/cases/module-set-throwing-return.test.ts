// @targets cc
// @expect pass
// @stdout 1

import { collectSetOrThrow } from './modules/module-set-throwing-return.ts'

try {
  console.log(collectSetOrThrow(false).size)
} catch (error) {
  console.log(0)
}
