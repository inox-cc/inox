import http from 'node:http'

function read(port: number, path: string, nonce: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { 'X-Inox-Keep-Alive': nonce }
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

export function startHttpKeepAliveClientAcceptance(port: number, nonce: string): void {
  runHttpKeepAliveClientAcceptance(port, nonce)
}

async function runHttpKeepAliveClientAcceptance(port: number, nonce: string): Promise<void> {
  const first = await read(port, '/first', nonce)
  const second = await read(port, '/second', nonce)

  if (first === 'keep-alive-first ' + nonce && second === 'keep-alive-second ' + nonce) {
    console.log('INOX_HTTP_KEEP_ALIVE_CLIENT_OK')
  }
}
