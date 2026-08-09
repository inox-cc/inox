// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import http from 'node:http'

http.get({ hostname: '127.0.0.1', agent: true })
