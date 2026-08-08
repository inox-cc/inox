import http from 'node:http'

export function startHttpStreamingServerAcceptance(port: number, nonce: string): void {
  const server = http.createServer()
  let accepted = 0
  let framingRejected = false

  server.on('request', (request, response) => {
    if (request.url === '/shutdown') {
      response.end('shutdown')
      server.close(() => {
        if (accepted === 3 && framingRejected) {
          console.log('INOX_HTTP_STREAMING_SERVER_OK')
        }
      })
      return
    }

    if (request.url === '/invalid') {
      response.setHeader('Content-Length', '1')
      response.write('a')

      try {
        response.end('b')
      } catch {
        framingRejected = true
      }

      return
    }

    const first =
      request.url === '/chunked' ? 'chunked ' + nonce : request.url === '/legacy' ? 'legacy ' + nonce : 'fixed ' + nonce

    if (request.url === '/fixed') {
      response.setHeader('Content-Length', String(first.length + 5))
    }

    if (
      (request.url === '/chunked' || request.url === '/fixed' || request.url === '/legacy') &&
      response.write(first) &&
      response.headersSent &&
      !response.writableEnded
    ) {
      accepted = accepted + 1
    }

    setTimeout(() => {
      response.end(' body')
    }, 200)
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTP_STREAMING_SERVER_READY ' + nonce + ' ' + String(port))
  })
}
