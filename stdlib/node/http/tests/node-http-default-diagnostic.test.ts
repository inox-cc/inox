// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import http from 'node:http'
http.createServer((request, response) => {
  response.end('ok')
})
