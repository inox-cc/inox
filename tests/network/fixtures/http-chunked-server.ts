import http from 'node:http'

export function startHttpChunkedServerAcceptance(port: number, nonce: string): void {
  const server = http.createServer()
  let accepted = 0

  server.on('request', (request, response) => {
    if (request.url === '/shutdown') {
      response.end('shutdown')
      server.close(() => {
        if (accepted === 1) {
          console.log('INOX_HTTP_CHUNKED_SERVER_OK')
        }
      })
      return
    }

    let body = ''
    let chunks = 0

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      chunks = chunks + 1
      body = body + chunk
    })
    request.on('end', () => {
      const valid =
        request.method === 'POST' &&
        request.url === '/chunked' &&
        request.headers['transfer-encoding'] === 'chunked' &&
        request.headers['trailer'] === 'X-Inox-Trailer' &&
        request.headers['x-inox-test'] === nonce &&
        body === 'chunked ' + nonce &&
        chunks >= 2

      if (valid) {
        accepted = accepted + 1
      }

      response.statusCode = valid ? 200 : 400
      response.end(valid ? 'chunked-server-ok ' + nonce : 'chunked-server-failed')
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTP_CHUNKED_SERVER_READY ' + nonce + ' ' + String(port))
  })
}
