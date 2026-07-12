// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

import { fileURLToPath } from 'node:url'
fileURLToPath(42)
