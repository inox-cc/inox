// @targets cc
// @expect diagnostics INOX_NOT_IMPLEMENTED

import http from 'node:http'

function boot(enabled: boolean): void {
  if (enabled) {
    const server = http.createServer(() => {})
    server.close()
  }
}

boot(true)
