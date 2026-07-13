// @targets cc
// @expect pass
// @stdout caught

import fs from 'node:fs'

try {
  fs.readFileSync('/inox/missing-library-operation-file', 'utf8')
  console.log('unexpected')
} catch {
  console.log('caught')
}
