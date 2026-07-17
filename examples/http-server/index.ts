import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize } from 'node:path'

function main(): void {
  const server = createServer((request, response) => {
    console.log('request', request.method, request.url)

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"ok":true}')
      return
    }

    if (request.method === 'GET' && request.url === '/time') {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end(String(Date.now()))
      return
    }

    if (request.method === 'GET' && request.url && !request.url.includes('..')) {
      const requestPath = request.url === '/' ? '/index.html' : request.url
      const filePath = join('dist/http-server/out/static', normalize(requestPath))

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

  server.listen(8080, '127.0.0.1', () => {
    console.log('http://127.0.0.1:8080/')
    console.log('files are served from dist/http-server/out/static; parent paths return 404')
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
