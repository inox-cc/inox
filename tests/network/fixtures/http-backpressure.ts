import http from 'node:http'

const requestChunkCount = 32
const responseChunkCount = 128
const chunkSize = 32 * 1024

export function startHttpBackpressureAcceptance(port: number, nonce: string): void {
  let requestBytes = 0
  let requestPaused = false
  let requestResumed = false
  let responseBlocked = false
  let responseDrained = false
  const server = http.createServer((request, response) => {
    let paused = false

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      requestBytes = requestBytes + chunk.length

      if (!paused) {
        paused = true
        request.pause()
        requestPaused = request.isPaused()
        setTimeout(() => {
          request.resume()
          requestResumed = !request.isPaused()
        }, 25)
      }
    })
    request.on('end', () => {
      const chunk = new Uint8Array(chunkSize)

      response.setHeader('Content-Length', String(responseChunkCount * chunkSize))
      response.setHeader('X-Inox-Backpressure', nonce)
      response.on('drain', () => {
        responseDrained = true
        response.end()
      })

      for (let index = 0; index < responseChunkCount; index = index + 1) {
        if (!response.write(chunk)) {
          responseBlocked = true
        }
      }

      if (!responseBlocked) {
        response.end()
      }
    })
  })

  server.listen(port, '127.0.0.1', () => {
    let clientBlocked = false
    let clientDrained = false
    let clientFinished = false
    let responseBytes = 0
    let responsePaused = false
    let responseResumed = false
    const client = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/backpressure',
        method: 'POST',
        headers: { 'Content-Length': String(requestChunkCount * chunkSize) }
      },
      (response) => {
        let paused = false

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          responseBytes = responseBytes + chunk.length

          if (!paused) {
            paused = true
            response.pause()
            responsePaused = response.isPaused()
            setTimeout(() => {
              response.resume()
              responseResumed = !response.isPaused()
            }, 25)
          }
        })
        response.on('end', () => {
          const valid =
            requestBytes === requestChunkCount * chunkSize &&
            requestPaused &&
            requestResumed &&
            responseBlocked &&
            responseDrained &&
            clientBlocked &&
            clientDrained &&
            clientFinished &&
            response.statusCode === 200 &&
            response.headers['x-inox-backpressure'] === nonce &&
            responseBytes === responseChunkCount * chunkSize &&
            responsePaused &&
            responseResumed

          server.close(() => {
            if (valid) {
              console.log('INOX_HTTP_BACKPRESSURE_OK')
            }
          })
        })
      }
    )
    const chunk = new Uint8Array(chunkSize)

    client.on('drain', () => {
      clientDrained = true
    })
    client.on('finish', () => {
      clientFinished = true
    })

    for (let index = 0; index < requestChunkCount; index = index + 1) {
      if (!client.write(chunk)) {
        clientBlocked = true
      }
    }

    client.end()
  })
}
