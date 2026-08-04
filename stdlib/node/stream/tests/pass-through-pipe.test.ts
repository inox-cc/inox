// @targets cc
// @expect pass
// @stdout piped
// @stdout destination ended

import { PassThrough } from 'node:stream'

const source = new PassThrough()
const destination = new PassThrough()

destination.on('data', (chunk) => {
  console.log(chunk.toString())
})
destination.on('end', () => {
  console.log('destination ended')
})

source.pipe(destination)
source.end('piped')
