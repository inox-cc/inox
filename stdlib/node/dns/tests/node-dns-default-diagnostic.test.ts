// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import dns from 'node:dns'

dns.lookup('localhost', () => {})
