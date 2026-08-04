// @targets cc
// @expect pass
// @stdout 1

import proc from 'node:process'

const snapshot = proc
console.log(snapshot.versions.inox === snapshot.versions.inox)
