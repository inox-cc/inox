// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import { exec } from 'node:child_process'
exec('echo hi')
