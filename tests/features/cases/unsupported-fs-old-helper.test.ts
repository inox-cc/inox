// @targets c
// @expect diagnostics INOX_FS_UNSUPPORTED

import fs from 'node:fs'
fs.readFileBytes('/tmp/x')
