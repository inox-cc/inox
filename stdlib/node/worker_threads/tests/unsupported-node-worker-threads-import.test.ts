// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_IMPORT_SOURCE

import worker from 'node:worker_threads'
console.log(worker)
