// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import path from 'node:path'
path.matchesGlob('/tmp/a', '*.a')
