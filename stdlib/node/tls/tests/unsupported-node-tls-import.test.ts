// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_IMPORT_SOURCE

import tls from 'node:tls'
console.log(tls)
