// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_IMPORT_SOURCE

import dns from 'node:dns'
console.log(dns)
