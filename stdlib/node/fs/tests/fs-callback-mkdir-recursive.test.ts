// @targets cc
// @expect pass
// @stdout 1
// @stdout removed

import fs from 'node:fs'

fs.mkdir('dist/fs-callback-directory/nested', { recursive: true }, (error, path) => {
  if (error) {
    console.log('mkdir failed')
    return
  }

  console.log(path === undefined)
  fs.rm('dist/fs-callback-directory', { recursive: true, force: true }, (rmError) =>
    console.log(rmError ? 'remove failed' : 'removed')
  )
})
