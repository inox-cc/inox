// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_IMPORT_SOURCE

import https from 'node:https'
console.log(https)
