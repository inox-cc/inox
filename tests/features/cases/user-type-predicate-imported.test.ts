// @targets cc
// @expect pass
// @stdout ADA

import { isString } from './modules/user-type-predicate'

const value: unknown = 'Ada'

if (isString(value)) {
  console.log(value.toUpperCase())
}
