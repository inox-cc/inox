import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize } from 'node:path'
import process from 'node:process'

function main(): void {
  const requestedPort = Number(process.argv[2]) ?? 0
  const port = requestedPort > 0 ? requestedPort : 8080
  const nonceArgument = process.argv[3]
  const nonce = nonceArgument.length > 0 ? nonceArgument : 'manual'
  const staticRootArgument = process.argv[4]
  const staticRoot = staticRootArgument.length > 0 ? staticRootArgument : 'dist/http-server/out/static'
  const server = createServer((request, response) => {
    console.log('request', request.method, request.url)

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"ok":true,"nonce":"' + nonce + '"}')
      return
    }

    if (request.method === 'GET' && request.url === '/time') {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end(String(Date.now()))
      return
    }

    if (request.method === 'GET' && request.url === '/network') {
      const marker = request.headers['x-inox-test'] ?? ''
      response.setHeader('X-Inox-Echo', marker).setHeader('X-Remove', 'unused')
      const configured =
        response.hasHeader('x-inox-echo') &&
        response.getHeader('X-Inox-Echo') === marker &&
        response.getHeaderNames().includes('x-inox-echo')
      response.removeHeader('X-Remove')
      response.setHeader('Content-Type', 'application/json')
      response.end(
        '{"configured":' + String(configured) +
        ',"headersSentBeforeEnd":' + String(response.headersSent) +
        ',"httpVersion":"' + request.httpVersion +
        '","remote":' + String((request.socket.remoteAddress ?? '').length > 0) + '}'
      )
      return
    }

    if (request.method === 'GET' && request.url && !request.url.includes('..')) {
      const requestPath = request.url === '/' ? '/index.html' : request.url
      const filePath = join(staticRoot, normalize(requestPath))

      try {
        const file = readFileSync(filePath)
        response.writeHead(200, { 'Content-Type': contentTypeForPath(requestPath) })
        response.end(file)
        return
      } catch {
        // Missing or unreadable files fall through to the shared 404 response.
      }
    }

    response.statusCode = 404
    response.setHeader('Content-Type', 'application/json')
    response.end('{"error":"not found"}')
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('INOX_HTTP_READY ' + nonce + ' ' + String(port))
    console.log('files are served from ' + staticRoot + '; parent paths return 404')
  })
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.html')) {
    return 'text/html; charset=utf-8'
  }

  if (path.endsWith('.txt')) {
    return 'text/plain; charset=utf-8'
  }

  return 'application/octet-stream'
}

main()
