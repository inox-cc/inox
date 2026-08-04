// @targets js cc
// @expect pass
// @stdout failed

import { chdir } from 'node:process'

try {
  chdir('/inox/path/that/does/not/exist')
} catch {
  console.log('failed')
}
