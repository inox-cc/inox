// @targets cc
// @expect pass
// @stdout Grace

import { sourceName as name } from './modules/renamed.ts'
console.log(name)
