import http from 'node:http'

export function startHttpChunkedErrorAcceptance(port: number): void {
  let errors = 0
  const onError = (): void => {
    errors = errors + 1

    if (errors === 2) {
      console.log('INOX_HTTP_CHUNKED_ERRORS_OK')
    }
  }

  const conflicting = http.get('http://127.0.0.1:' + String(port) + '/conflicting')
  conflicting.on('error', onError)

  const truncated = http.get('http://127.0.0.1:' + String(port) + '/truncated')
  truncated.on('error', onError)
}
