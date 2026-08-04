// @targets js cc
// @expect pass
// @stdout %F0%9F%98%80=emoji&%EF%BF%BD=replacement

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('%EF%BF%BD=replacement&%F0%9F%98%80=emoji')
params.sort()
console.log(params.toString())
