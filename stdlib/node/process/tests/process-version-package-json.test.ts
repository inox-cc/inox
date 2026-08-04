// @targets cc
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1
// @stdout 1

import process, { version, versions } from 'node:process'

console.log(process.version.startsWith('v'))
console.log(process.version.length > 1)
console.log(version === process.version)
console.log(versions.inox === process.version.slice(1))
