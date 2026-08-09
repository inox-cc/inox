// @targets cc
// @expect pass
// @stdout 1 0

import fs from 'node:fs'

fs.readFile('dist/fs-callback-missing.txt', (error, data) => {
  console.log(error !== null, data.length)
})
