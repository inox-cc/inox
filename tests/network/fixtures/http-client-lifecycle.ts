import http from 'node:http'

export function startHttpClientLifecycleAcceptance(port: number, nonce: string): void {
  const server = http.createServer((request, response) => {
    let closed = false

    request.on('close', () => {
      closed = true
    })
    setTimeout(() => {
      if (!closed) response.end('late')
    }, 100)
  })

  server.listen(port, '127.0.0.1', () => {
    const runDestroy = (): void => {
      let errors = 0
      let destroyedImmediately = false
      const request = http.request({ hostname: '127.0.0.1', port, path: '/destroy' })

      request.on('error', (error) => {
        if (error.message === `manual ${nonce}`) errors = errors + 1
      })
      request.on('close', () => {
        server.close(() => {
          if (errors === 1 && destroyedImmediately) console.log('INOX_HTTP_CLIENT_LIFECYCLE_OK')
        })
      })
      request.destroy(new Error(`manual ${nonce}`))
      destroyedImmediately = request.destroyed
    }
    const runAbort = (): void => {
      const controller = new AbortController()
      let errors = 0
      const request = http.request({ hostname: '127.0.0.1', port, path: '/abort', signal: controller.signal })

      request.on('error', (error) => {
        if (error.message === 'The operation was aborted') errors = errors + 1
      })
      request.on('close', () => {
        if (errors === 1 && request.destroyed) runDestroy()
      })
      request.end()
      setTimeout(() => {
        controller.abort()
      }, 20)
    }
    let timeoutEvents = 0
    let timeoutCallbacks = 0
    let openAtTimeout = false
    const timeoutRequest = http.request({ hostname: '127.0.0.1', port, path: '/timeout', timeout: 20 })

    timeoutRequest.on('timeout', () => {
      timeoutEvents = timeoutEvents + 1
      openAtTimeout = !timeoutRequest.destroyed
      timeoutRequest.destroy()
    })
    timeoutRequest.setTimeout(20, () => {
      timeoutCallbacks = timeoutCallbacks + 1
    })
    timeoutRequest.on('close', () => {
      if (timeoutEvents === 1 && timeoutCallbacks === 1 && openAtTimeout && timeoutRequest.destroyed) runAbort()
    })
    timeoutRequest.end()
  })
}
