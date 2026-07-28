// @targets cc
// @expect pass
// @stdout caught

import path from 'node:path'

const value = JSON.parse('{"dir":1}')

try {
  path.format(value)
} catch {
  console.log('caught')
}
