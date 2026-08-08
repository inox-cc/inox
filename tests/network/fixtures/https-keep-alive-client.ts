import https from 'node:https'

function read(port: number, path: string, nonce: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { 'X-Inox-Https-Keep-Alive': nonce },
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
          resolve(body)
        })
        response.on('error', (error) => {
          reject(error)
        })
      }
    )

    request.on('error', (error) => {
      reject(error)
    })
  })
}

export function startHttpsKeepAliveClientAcceptance(port: number, nonce: string): void {
  runHttpsKeepAliveClientAcceptance(port, nonce)
}

async function runHttpsKeepAliveClientAcceptance(port: number, nonce: string): Promise<void> {
  const first = await read(port, '/first', nonce)
  const second = await read(port, '/second', nonce)

  if (first === 'https-keep-alive-first ' + nonce && second === 'https-keep-alive-second ' + nonce) {
    console.log('INOX_HTTPS_KEEP_ALIVE_CLIENT_OK')
  }
}
