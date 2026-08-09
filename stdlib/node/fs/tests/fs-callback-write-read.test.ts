// @targets cc
// @expect pass
// @stdout callback data
// @stdout removed

import fs from 'node:fs'

fs.writeFile('dist/fs-callback-write-read.txt', 'callback data', (writeError) => {
  if (writeError) {
    console.log('write failed')
    return
  }

  fs.readFile('dist/fs-callback-write-read.txt', 'utf8', (readError, data) => {
    if (readError) {
      console.log('read failed')
      return
    }

    console.log(data)
    fs.unlink('dist/fs-callback-write-read.txt', (unlinkError) =>
      console.log(unlinkError ? 'remove failed' : 'removed')
    )
  })
})
