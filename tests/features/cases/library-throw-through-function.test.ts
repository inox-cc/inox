// @targets cc
// @expect pass
// @stdout caught

import fs from 'node:fs'

function readMissing(): void {
  fs.readFileSync('/inox/missing-library-operation-through-function', 'utf8')
  console.log('unexpected inside')
}

try {
  readMissing()
  console.log('unexpected after')
} catch {
  console.log('caught')
}
