import http from 'node:http'

export function startHttpServerTimeoutAcceptance(port: number): void {
  let callbackCount = 0
  let eventCount = 0
  let clientClosed = false
  let serverClosed = false
  let reported = false
  const server = http.createServer()
  const report = (): void => {
    if (!reported && callbackCount === 1 && eventCount === 1 && clientClosed && serverClosed) {
      reported = true
      console.log('INOX_HTTP_SERVER_TIMEOUT_OK')
    }
  }

  server.setTimeout(20, () => {
    callbackCount = callbackCount + 1
  })
  server.on('timeout', (socket) => {
    eventCount = eventCount + 1
    socket.destroy()
    server.close(() => {
      serverClosed = true
      report()
    })
  })
  server.listen(port, '127.0.0.1', () => {
    const request = http.request({ hostname: '127.0.0.1', port })

    request.on('error', () => {})
    request.on('close', () => {
      clientClosed = true
      report()
    })
  })
}
