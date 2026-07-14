// @targets cc
// @expect pass
// @stdout 42

import { valueOrZero } from './modules/object-function-param.ts'
import type { BoxContext } from './modules/object-function-param.ts'

const context: BoxContext = {
  boxes: new Map()
}

context.boxes.set('answer', {
  value: 42
})

console.log(valueOrZero(context.boxes.get('answer')))
