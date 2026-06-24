import { createServer } from 'node:http'

function main(): void {
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"ok":true}')
      return
    }

    if (request.method === 'GET' && request.url === '/time') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"data":"static inox http response"}')
      return
    }

    response.statusCode = 404
    response.setHeader('Content-Type', 'application/json')
    response.end('{"error":"not found"}')
  })

  server.listen(8080, '127.0.0.1', () => {
    console.log('http server listening on http://127.0.0.1:8080')
    console.log('try: curl http://127.0.0.1:8080/health')
  })
}

main()
