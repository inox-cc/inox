import http from 'node:http'

export function startHttpAcceptance(port: number, nonce: string): void {
  const server = http.createServer()

  server.on('request', (request, response) => {
    const marker = request.headers['x-inox-test'] ?? ''

    response.statusCode = request.method === 'GET' && request.url === '/network' ? 200 : 404
    response
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .setHeader('X-Inox-Echo', marker)
    response.end('http-ok ' + marker)
    server.close(() => {
      console.log('INOX_HTTP_CLOSED')
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTP_READY ' + nonce + ' ' + String(port))
  })
}
