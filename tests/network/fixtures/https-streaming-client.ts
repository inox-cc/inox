import https from 'node:https'

export function startHttpsStreamingClientAcceptance(port: number, nonce: string): void {
  const first = 'secure ' + nonce
  let finished = false
  const request = https.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/chunked',
      method: 'POST',
      rejectUnauthorized: false,
      headers: { Connection: 'close' }
    },
    (response) => {
      let body = ''

      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body = body + chunk
      })
      response.on('end', () => {
        if (finished && response.statusCode === 200 && body === 'https-streaming-ok ' + nonce) {
          console.log('INOX_HTTPS_STREAMING_CLIENT_OK')
        }
      })
    }
  )

  request.on('finish', () => {
    finished = true
  })
  request.write(first)
  setTimeout(() => {
    request.end(' body')
  }, 200)
}
