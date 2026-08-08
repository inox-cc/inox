import { readFileSync } from 'node:fs'
import https from 'node:https'

export function startHttpsServerAcceptance(
  port: number,
  nonce: string,
  certificatePath: string,
  privateKeyPath: string
): void {
  let accepted = false
  const server = https.createServer({
    cert: readFileSync(certificatePath, 'utf8'),
    key: readFileSync(privateKeyPath, 'utf8')
  })

  server.on('request', (request, response) => {
    if (request.url === '/shutdown') {
      response.end('shutdown')
      server.close(() => {
        if (accepted) {
          console.log('INOX_HTTPS_SERVER_OK')
        }
      })
      return
    }

    let body = ''
    let chunks = 0

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body = body + chunk
      chunks = chunks + 1
    })
    request.on('end', () => {
      const valid =
        request.method === 'POST' &&
        request.url === '/network' &&
        request.headers['x-inox-https-server'] === nonce &&
        chunks >= 2 &&
        body === 'https-server-body ' + nonce

      accepted = valid
      response.statusCode = valid ? 200 : 400
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.setHeader('X-Inox-Https-Server', nonce)
      response.end(valid ? 'https-server-ok ' + nonce : 'invalid HTTPS request')
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTPS_SERVER_READY ' + nonce + ' ' + String(port))
  })
}
