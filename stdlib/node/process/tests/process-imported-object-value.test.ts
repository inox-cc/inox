// @targets cc
// @expect pass
// @stdout 1
// @stdout 1

import process from 'node:process'

const snapshot = process

console.log(snapshot.version === process.version)
console.log(snapshot.versions.inox === process.version.slice(1))
