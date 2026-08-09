import net from 'node:net'

export function startTcpLifecycleAcceptance(): void {
  let acceptedConnections = 0
  let connectionCountChecked = false
  let defaultLimitChecked = false
  let limitChecked = false
  let limitReadChecked = false
  let timeoutCallbackCalled = false
  let timeoutEventCalled = false

  const server = net.createServer()

  server.on('connection', (socket) => {
    acceptedConnections += 1

    socket.setTimeout(100, () => {
      timeoutCallbackCalled = true
    })
    socket.on('timeout', () => {
      timeoutEventCalled = true
      socket.destroy()
    })

    server.getConnections((error, count) => {
      connectionCountChecked = error === null && count === 1

      const address = server.address()
      // @ts-expect-error Inox TCP servers return AddressInfo rather than Node's IPC/null union.
      const overflow = net.createConnection(address.port, '127.0.0.1')
      overflow.on('error', () => {})
      overflow.on('close', () => {
        limitChecked = acceptedConnections === 1

        server.close(() => {
          server.getConnections((closeError, closeCount) => {
            if (
              closeError === null &&
              closeCount === 0 &&
              connectionCountChecked &&
              defaultLimitChecked &&
              limitChecked &&
              limitReadChecked &&
              timeoutCallbackCalled &&
              timeoutEventCalled
            ) {
              console.log('INOX_TCP_LIFECYCLE_OK')
            }
          })
        })
      })
    })
  })

  defaultLimitChecked = server.maxConnections === undefined
  server.maxConnections = 1
  limitReadChecked = server.maxConnections === 1

  server.on('listening', () => {
    const address = server.address()
    // @ts-expect-error Inox TCP servers return AddressInfo rather than Node's IPC/null union.
    const client = net.createConnection(address.port, '127.0.0.1')
    client.on('error', () => {})
  })

  server.listen(0, '127.0.0.1')
}
