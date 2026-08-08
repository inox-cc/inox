import https from 'node:https'

export function startHttpsClientAcceptance(port: number, nonce: string): void {
  const request = https.get(
    {
      hostname: '127.0.0.1',
      port,
      path: '/secure',
      headers: { 'X-Inox-Https': nonce },
      rejectUnauthorized: false,
      servername: 'localhost'
    },
    (response) => {
      let body = ''

      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body = body + chunk
      })
      response.on('end', () => {
        if (response.statusCode === 200 && response.headers['x-inox-https'] === nonce && body === 'https-ok ' + nonce) {
          console.log('INOX_HTTPS_CLIENT_OK')
        }
      })
    }
  )

  request.on('error', () => {
    console.log('INOX_HTTPS_CLIENT_ERROR')
  })
}
