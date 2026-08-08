import http from 'node:http'

export function startHttpIncomingStreamingServerAcceptance(port: number, nonce: string): void {
  const server = http.createServer()
  let accepted = 0

  server.on('request', (request, response) => {
    if (request.url === '/shutdown') {
      response.end('shutdown')
      server.close(() => {
        if (accepted === 2) {
          console.log('INOX_HTTP_INCOMING_STREAMING_SERVER_OK')
        }
      })
      return
    }

    let body = ''
    let chunks = 0
    let firstChunkAt = 0
    let lastChunkAt = 0
    const earlyWrite = response.setHeader('Content-Length', '8').write('ready ')

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      const now = Date.now()

      if (chunks === 0) {
        firstChunkAt = now
      }

      chunks = chunks + 1
      lastChunkAt = now
      body = body + chunk
    })
    request.on('end', () => {
      const fixed = request.url === '/fixed'
      const chunked = request.url === '/chunked'
      const expected = (fixed ? 'fixed ' : 'chunked ') + nonce + ' body'
      const valid =
        earlyWrite &&
        response.headersSent &&
        !response.writableEnded &&
        request.method === 'POST' &&
        (fixed || chunked) &&
        chunks >= 2 &&
        lastChunkAt - firstChunkAt >= 100 &&
        body === expected &&
        (fixed
          ? request.headers['content-length'] === String(expected.length)
          : request.headers['transfer-encoding'] === 'chunked')

      if (valid) {
        accepted = accepted + 1
      }

      response.end(valid ? 'ok' : 'no')
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTP_INCOMING_STREAMING_SERVER_READY ' + nonce + ' ' + String(port))
  })
}
