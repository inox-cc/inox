import { readFileSync } from 'node:fs'
import https from 'node:https'

export function startHttpsClientLifecycleAcceptance(
  port: number,
  certificatePath: string,
  privateKeyPath: string
): void {
  const server = https.createServer(
    { cert: readFileSync(certificatePath, 'utf8'), key: readFileSync(privateKeyPath, 'utf8') },
    (request, response) => {
      let closed = false

      request.on('close', () => {
        closed = true
      })
      setTimeout(() => {
        if (!closed) response.end('late')
      }, 100)
    }
  )

  server.listen(port, '127.0.0.1', () => {
    const runAbort = (): void => {
      const controller = new AbortController()
      let errors = 0
      const request = https.request({
        hostname: '127.0.0.1',
        port,
        path: '/abort',
        rejectUnauthorized: false,
        signal: controller.signal
      })

      request.on('error', (error) => {
        if (error.message === 'The operation was aborted') errors = errors + 1
      })
      request.on('close', () => {
        server.close(() => {
          if (errors === 1 && request.destroyed) console.log('INOX_HTTPS_CLIENT_LIFECYCLE_OK')
        })
      })
      request.end()
      setTimeout(() => {
        controller.abort()
      }, 20)
    }
    let timeouts = 0
    const timeoutRequest = https.request({
      hostname: '127.0.0.1',
      port,
      path: '/timeout',
      rejectUnauthorized: false,
      timeout: 20
    })

    timeoutRequest.on('timeout', () => {
      timeouts = timeouts + 1
      timeoutRequest.destroy()
    })
    timeoutRequest.on('close', () => {
      if (timeouts === 1 && timeoutRequest.destroyed) runAbort()
    })
    timeoutRequest.end()
  })
}
