// @targets cc
// @expect pass
// @stdout ADA

import { consume } from './modules/generic-callback'

consume('Ada', item => console.log(item.toUpperCase()))
