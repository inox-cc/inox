// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import path from 'node:path'
path.toNamespacedPath('/tmp/a')
