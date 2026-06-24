import { createServer } from 'node:http'

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

    if (request.method === 'GET' && (response as any).sendLocalFile(request, '/', 'dist/http-server/out/static')) {
      return
    }

    response.statusCode = 404
    response.setHeader('Content-Type', 'application/json')
    response.end('{"error":"not found"}')
  })

  server.listen(8080, '127.0.0.1', () => {
    console.log('http server listening on http://127.0.0.1:8080')
    console.log('try: curl http://127.0.0.1:8080/')
    console.log('try: curl http://127.0.0.1:8080/health')
    console.log('try: curl http://127.0.0.1:8080/time')
    console.log('try: curl http://127.0.0.1:8080/index.html')
    console.log('try: curl http://127.0.0.1:8080/hello.txt')
    console.log('files are served from dist/http-server/out/static; parent paths return 404')
  })
}

main()
