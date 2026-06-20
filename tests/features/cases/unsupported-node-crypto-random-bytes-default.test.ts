// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import { randomBytes } from 'node:crypto'
randomBytes(4)
