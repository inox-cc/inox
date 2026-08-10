// @targets cc
// @expect pass
// @stdout inox

import type { ParsedPath } from 'node:path'

const value: ParsedPath = {
  root: '/',
  dir: '/tmp',
  base: 'inox.ts',
  ext: '.ts',
  name: 'inox'
}

console.log(value.name)
