// @targets cc
// @expect pass
// @stdout ok

import buffer from 'node:buffer'
const bytes = buffer.Buffer.from('ok')
console.log(bytes.toString())
