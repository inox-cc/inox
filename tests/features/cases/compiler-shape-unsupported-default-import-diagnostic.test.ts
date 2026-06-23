// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import httpServer from 'node:http'

function boot(enabled: boolean): void {
  if (enabled) {
    httpServer.createServer(() => {})
  }
}

boot(true)
