// @targets cc
// @expect pass
// @stdout 1

import type { ImportedFlags } from './modules/imported-boolean-index.ts'

const flags: ImportedFlags = { ready: true }

console.log(flags.ready)
