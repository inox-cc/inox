import http from 'node:http'

export function startHttpStreamingClientAcceptance(port: number, nonce: string): void {
  const chunkedFirst = 'chunked ' + nonce
  let chunkedFinished = false
  let fixedFinished = false
  let chunkedValid = false
  let framingRejected = false
  const invalid = http.request({
    hostname: '127.0.0.1',
    port: 1,
    path: '/',
    method: 'POST',
    headers: { 'Content-Length': '1', Connection: 'close' }
  })

  invalid.write('a')

  try {
    invalid.end('b')
  } catch {
    framingRejected = true
  }

  const chunked = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/chunked',
      method: 'POST'
    },
    (response) => {
      let body = ''

      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body = body + chunk
      })
      response.on('end', () => {
        chunkedValid = response.statusCode === 200 && body === 'http-streaming-chunked-ok ' + nonce

        const fixedFirst = 'fixed ' + nonce
        const fixed = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/fixed',
            method: 'POST',
            headers: {
              'Content-Length': String(fixedFirst.length + 5),
              Connection: 'close'
            }
          },
          (fixedResponse) => {
            let fixedBody = ''

            fixedResponse.setEncoding('utf8')
            fixedResponse.on('data', (chunk) => {
              fixedBody = fixedBody + chunk
            })
            fixedResponse.on('end', () => {
              if (
                chunkedValid &&
                framingRejected &&
                chunkedFinished &&
                fixedFinished &&
                fixedResponse.statusCode === 200 &&
                fixedBody === 'http-streaming-fixed-ok ' + nonce
              ) {
                console.log('INOX_HTTP_STREAMING_CLIENT_OK')
              }
            })
          }
        )

        fixed.on('finish', () => {
          fixedFinished = true
        })
        fixed.write(fixedFirst)
        setTimeout(() => {
          fixed.end(' body')
        }, 200)
      })
    }
  )

  chunked.on('finish', () => {
    chunkedFinished = true
  })
  chunked.write(chunkedFirst)
  setTimeout(() => {
    chunked.end(' body')
  }, 200)
}
