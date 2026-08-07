// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import dns from 'node:dns/promises'

dns.lookup('localhost')
