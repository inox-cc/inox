// @targets c
// @expect diagnostics INOX_FS_UNSUPPORTED

import fs from 'node:fs'
fs.readFile('/tmp/x', () => {})
