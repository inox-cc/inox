// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_IMPORT_SOURCE

import zlib from 'node:zlib'
console.log(zlib)
