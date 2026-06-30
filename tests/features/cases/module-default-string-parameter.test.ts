// @targets cc
// @expect pass
// @stdout value: fallback

import { render } from './modules/default-string.ts'

console.log(render('value'))
