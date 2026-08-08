import http from 'node:http'

export function startHttpChunkedClientAcceptance(port: number, nonce: string): void {
  const request = http.get(
    {
      hostname: '127.0.0.1',
      port,
      path: '/chunked',
      headers: { 'X-Inox-Chunked': nonce }
    },
    (response) => {
      let body = ''
      let chunks = 0

      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        chunks = chunks + 1
        body = body + chunk
      })
      response.on('end', () => {
        if (
          response.statusCode === 200 &&
          response.headers['transfer-encoding'] === 'chunked' &&
          response.headers['x-inox-chunked'] === nonce &&
          body === 'http-chunked-ok ' + nonce &&
          chunks >= 2
        ) {
          console.log('INOX_HTTP_CHUNKED_CLIENT_OK')
        }
      })
    }
  )

  request.on('error', (error) => {
    console.log('INOX_HTTP_CHUNKED_CLIENT_ERROR ' + error.message)
  })
}
