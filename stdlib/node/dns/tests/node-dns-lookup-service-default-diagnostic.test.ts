// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import dns from 'node:dns'

dns.lookupService('127.0.0.1', 80, () => {})
