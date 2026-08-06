import http from 'node:http'

export function startHttpClientAcceptance(): void {
  const server = http.createServer((request, response) => {
    let body = ''

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body = body + chunk
    })
    request.on('end', () => {
      const marker = request.headers['x-inox-client'] ?? ''
      const validPost = request.method === 'POST' && request.url === '/client' && body === 'ping'
      const validGet = request.method === 'GET' && request.url === '/get' && body === ''

      response.statusCode = validPost ? 201 : validGet ? 200 : 400
      response.setHeader('X-Inox-Client', marker)
      response.end(validPost ? 'client-ok' : validGet ? 'get-ok' : 'client-failed')
    })
  })

  server.listen(0, '127.0.0.1', () => {
    // @ts-expect-error Inox narrows Server.address() to AddressInfo.
    const port = server.address().port
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/client',
        method: 'POST',
        headers: { 'X-Inox-Client': 'yes' }
      },
      (response) => {
        let body = ''

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body = body + chunk
        })
        response.on('end', () => {
          if (
            response.statusCode === 201 &&
            response.statusMessage === 'Created' &&
            response.headers['x-inox-client'] === 'yes' &&
            body === 'client-ok'
          ) {
            console.log('INOX_HTTP_CLIENT_OK')
          }

          let getBody = ''
          http.get('http://127.0.0.1:' + String(port) + '/get', (getResponse) => {
            getResponse.setEncoding('utf8')
            getResponse.on('data', (chunk) => {
              getBody = getBody + chunk
            })
            getResponse.on('end', () => {
              if (getResponse.statusCode === 200 && getBody === 'get-ok') {
                console.log('INOX_HTTP_GET_OK')
              }

              server.close(() => {
                console.log('INOX_HTTP_CLIENT_CLOSED')
              })
            })
          })
        })
      }
    )

    if (
      request.hasHeader('x-inox-client') &&
      request.getHeader('X-Inox-Client') === 'yes' &&
      request.getHeaderNames().includes('x-inox-client')
    ) {
      console.log('INOX_HTTP_CLIENT_HEADERS_OK')
    }

    request.on('finish', () => {
      console.log('INOX_HTTP_CLIENT_FINISHED')
    })
    request.write('pi')
    request.end('ng')
  })
}
