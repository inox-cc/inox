import http from 'node:http'

export function startHttpKeepAliveServerAcceptance(port: number, nonce: string): void {
  const server = http.createServer()
  let accepted = 0

  server.on('request', (request, response) => {
    let body = ''

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body = body + chunk
    })
    request.on('end', () => {
      const expectedBody = request.url === '/first' ? nonce : request.url === '/chunked' ? 'chunked ' + nonce : ''
      const valid =
        body === expectedBody &&
        ((request.url === '/first' && request.httpVersion === '1.1') ||
          (request.url === '/chunked' && request.httpVersion === '1.1') ||
          (request.url === '/close' && request.httpVersion === '1.1') ||
          (request.url === '/pipelined-first' && request.httpVersion === '1.1') ||
          (request.url === '/pipelined-close' && request.httpVersion === '1.1') ||
          (request.url === '/idle' && request.httpVersion === '1.1') ||
          (request.url === '/http10-close' && request.httpVersion === '1.0') ||
          (request.url === '/http10-first' && request.httpVersion === '1.0') ||
          (request.url === '/shutdown' && request.httpVersion === '1.0'))

      if (valid) {
        accepted = accepted + 1
      }

      response.statusCode = valid ? 200 : 400
      response.end(valid ? request.url : 'invalid keep-alive request')

      if (request.url === '/shutdown') {
        server.close(() => {
          if (accepted === 9) {
            console.log('INOX_HTTP_KEEP_ALIVE_SERVER_OK')
          }
        })
      }
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTP_KEEP_ALIVE_SERVER_READY ' + nonce + ' ' + String(port))
  })
}
