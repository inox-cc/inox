// @targets js cc
// @expect pass
// @stdout a=first&z=last&z=second

import { URLSearchParams } from 'node:url'

const params = new URLSearchParams('z=last&a=first&z=second')
params.sort()
console.log(params.toString())
