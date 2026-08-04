import dgram from 'node:dgram'

export function startUdpAcceptance(): void {
  const server = dgram.createSocket('udp4')

  server.on('message', (message, remoteInfo) => {
    if (message.length === 4 && remoteInfo.port > 0) {
      console.log('INOX_UDP_OK')
    }

    server.close()
  })

  server.on('listening', () => {
    const client = dgram.createSocket('udp4')
    const address = server.address()

    client.send('ping', address.port, '127.0.0.1', () => {
      client.close()
    })
  })

  server.bind(0, '127.0.0.1')
}
