import net from 'node:net'

export function startTcpAcceptance(): void {
  const server = net.createServer((socket) => {
    socket.end('tcp-ok')
  })

  server.on('listening', () => {
    const address = server.address()
    // @ts-expect-error Inox TCP servers return AddressInfo rather than Node's IPC/null union.
    const client = net.createConnection(address.port, '127.0.0.1')

    client.setEncoding('utf8')
    client.on('data', (chunk) => {
      if (chunk === 'tcp-ok') {
        console.log('INOX_TCP_OK')
      }
    })
    client.on('end', () => {
      server.close()
    })
  })

  server.listen(0, '127.0.0.1')
}
