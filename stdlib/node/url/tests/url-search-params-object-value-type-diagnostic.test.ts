// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

import { URLSearchParams } from 'node:url'
new URLSearchParams({ q: 42 })
