import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer, get as getHttp, type Server as HttpServer } from 'node:http'
import { createServer as createHttpsServer, request as requestHttps, type Server as HttpsServer } from 'node:https'
import { connect as connectNetSocket, createServer as createNetServer, type Server as NetServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCommand } from './lib/run-command.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const compilerMode = process.argv[2] === 'hosted' ? 'hosted' : 'native'
const buildRoot = join(repoRoot, 'dist/network', `acceptance-${compilerMode}-${process.pid}`)
const executable = join(buildRoot, 'bin', 'network-acceptance')

async function main(): Promise<void> {
  const port = await reservePort()
  const httpChunkedServerPort = await reservePort()
  const httpKeepAliveServerPort = await reservePort()
  const httpStreamingServerPort = await reservePort()
  const httpIncomingStreamingServerPort = await reservePort()
  const httpsServerPort = await reservePort()
  const nonce = `network-${process.pid}-${Date.now()}`

  await buildExecutable()
  const httpChunkedServer = await startHttpChunkedServer(nonce)
  const httpKeepAliveClientServer = await startHttpKeepAliveClientServer(nonce)
  const invalidChunkedServer = await startInvalidChunkedServer()
  const httpsServer = await startHttpsServer(nonce)
  const httpsKeepAliveClientServer = await startHttpsKeepAliveClientServer(nonce)
  const httpStreamingClientServer = await startHttpStreamingClientServer(nonce)
  const httpsStreamingClientServer = await startHttpsStreamingClientServer(nonce)

  const application = spawn(
    executable,
    [
      String(port),
      nonce,
      String(httpsServer.port),
      String(httpChunkedServer.port),
      String(invalidChunkedServer.port),
      String(httpChunkedServerPort),
      String(httpKeepAliveServerPort),
      String(httpKeepAliveClientServer.port),
      String(httpsKeepAliveClientServer.port),
      String(httpStreamingServerPort),
      String(httpStreamingClientServer.port),
      String(httpsStreamingClientServer.port),
      String(httpIncomingStreamingServerPort),
      String(httpsServerPort),
      join(repoRoot, 'tests/network/fixtures/https-cert.pem'),
      join(repoRoot, 'tests/network/fixtures/https-key.pem')
    ],
    {
      cwd: repoRoot,
      stdio: 'pipe'
    }
  )
  let stdout = ''
  let stderr = ''

  application.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  application.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  try {
    await waitForLine(
      application,
      `INOX_HTTP_READY ${nonce} ${port}`,
      () => stdout,
      () => stderr
    )
    await waitForLine(
      application,
      `INOX_HTTP_CHUNKED_SERVER_READY ${nonce} ${httpChunkedServerPort}`,
      () => stdout,
      () => stderr
    )
    await waitForLine(
      application,
      `INOX_HTTP_KEEP_ALIVE_SERVER_READY ${nonce} ${httpKeepAliveServerPort}`,
      () => stdout,
      () => stderr
    )
    await waitForLine(
      application,
      `INOX_HTTP_STREAMING_SERVER_READY ${nonce} ${httpStreamingServerPort}`,
      () => stdout,
      () => stderr
    )
    await waitForLine(
      application,
      `INOX_HTTP_INCOMING_STREAMING_SERVER_READY ${nonce} ${httpIncomingStreamingServerPort}`,
      () => stdout,
      () => stderr
    )
    await waitForLine(
      application,
      `INOX_HTTPS_SERVER_READY ${nonce} ${httpsServerPort}`,
      () => stdout,
      () => stderr
    )

    await checkChunkedHttpServer(httpChunkedServerPort, nonce)
    await checkHttpKeepAliveServer(httpKeepAliveServerPort, nonce)
    await checkHttpStreamingServer(httpStreamingServerPort, nonce)
    await checkHttpIncomingStreamingServer(httpIncomingStreamingServerPort, nonce)
    await checkHttpsServer(httpsServerPort, nonce)

    const response = await fetchWithTimeout(`http://127.0.0.1:${port}/network`, 2_000, {
      'X-Inox-Test': nonce
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.equal(response.headers.get('x-inox-echo'), nonce)
    assert.equal(await response.text(), `http-ok ${nonce}`)

    assert.ok(await waitForExit(application, 5_000), processFailure('network executable завис', stdout, stderr))
    assert.equal(application.exitCode, 0, processFailure('network executable завершился с ошибкой', stdout, stderr))

    const lines = stdout.split(/\r?\n/)
    assert.ok(lines.includes('INOX_TCP_OK'), processFailure('TCP acceptance не завершён', stdout, stderr))
    assert.ok(lines.includes('INOX_UDP_OK'), processFailure('UDP acceptance не завершён', stdout, stderr))
    assert.ok(lines.includes('INOX_DNS_CALLBACK_OK'), processFailure('DNS callback lookup не завершён', stdout, stderr))
    assert.ok(lines.includes('INOX_DNS_PROMISE_OK'), processFailure('DNS promise lookup не завершён', stdout, stderr))
    assert.ok(lines.includes('INOX_HTTP_CLOSED'), processFailure('HTTP server не закрылся', stdout, stderr))
    assert.ok(lines.includes('INOX_HTTP_CLIENT_OK'), processFailure('HTTP client не получил ответ', stdout, stderr))
    assert.ok(
      lines.includes('INOX_HTTP_CLIENT_HEADERS_OK'),
      processFailure('HTTP client headers не прошли проверку', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_CLIENT_FINISHED'),
      processFailure('HTTP client finish не был вызван', stdout, stderr)
    )
    assert.ok(lines.includes('INOX_HTTP_GET_OK'), processFailure('HTTP get не получил ответ', stdout, stderr))
    assert.ok(
      lines.includes('INOX_HTTP_CLIENT_CLOSED'),
      processFailure('HTTP client server не закрылся', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_CHUNKED_CLIENT_OK'),
      processFailure('HTTP client не декодировал chunked response', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_CHUNKED_ERRORS_OK'),
      processFailure('HTTP client не отверг некорректный chunked framing', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_CHUNKED_SERVER_OK'),
      processFailure('HTTP server неверно обработал chunked requests', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_KEEP_ALIVE_SERVER_OK'),
      processFailure('HTTP server неверно обработал keep-alive connections', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_KEEP_ALIVE_CLIENT_OK'),
      processFailure('HTTP client не переиспользовал keep-alive connection', stdout, stderr)
    )
    assert.deepEqual(
      httpKeepAliveClientServer.stats(),
      { connections: 1, requests: 2 },
      processFailure('HTTP client открыл лишнее соединение вместо keep-alive reuse', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTPS_KEEP_ALIVE_CLIENT_OK'),
      processFailure('HTTPS client не переиспользовал keep-alive connection', stdout, stderr)
    )
    assert.deepEqual(
      httpsKeepAliveClientServer.stats(),
      { connections: 1, requests: 2 },
      processFailure('HTTPS client открыл лишнее TLS-соединение вместо keep-alive reuse', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_STREAMING_CLIENT_OK'),
      processFailure('HTTP client не завершил streaming requests', stdout, stderr)
    )
    assert.deepEqual(
      httpStreamingClientServer.stats(),
      { connections: 1, requests: 2, chunked: true, fixed: true },
      processFailure('HTTP client не отправил chunks до end или нарушил framing', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTPS_STREAMING_CLIENT_OK'),
      processFailure('HTTPS client не завершил streaming request', stdout, stderr)
    )
    assert.deepEqual(
      httpsStreamingClientServer.stats(),
      { requests: 1, chunked: true },
      processFailure('HTTPS client не отправил chunks до end или нарушил framing', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_STREAMING_SERVER_OK'),
      processFailure('HTTP server не завершил streaming responses', stdout, stderr)
    )
    assert.ok(
      lines.includes('INOX_HTTP_INCOMING_STREAMING_SERVER_OK'),
      processFailure('HTTP server не доставил входящее тело по мере получения', stdout, stderr)
    )
    assert.ok(lines.includes('INOX_HTTPS_CLIENT_OK'), processFailure('HTTPS client не получил ответ', stdout, stderr))
    assert.ok(
      lines.includes('INOX_HTTPS_SERVER_OK'),
      processFailure('HTTPS server не завершил acceptance', stdout, stderr)
    )
  } finally {
    await stopProcess(application)
    await closeHttpServer(httpChunkedServer.server)
    await closeHttpServer(httpKeepAliveClientServer.server)
    await closeNetServer(invalidChunkedServer.server)
    await closeHttpsServer(httpsServer.server)
    await closeHttpsServer(httpsKeepAliveClientServer.server)
    await closeHttpServer(httpStreamingClientServer.server)
    await closeHttpsServer(httpsStreamingClientServer.server)
    await rm(buildRoot, { recursive: true, force: true })
  }
}

async function startHttpsKeepAliveClientServer(nonce: string): Promise<{
  readonly server: HttpsServer
  readonly port: number
  readonly stats: () => { readonly connections: number; readonly requests: number }
}> {
  const certificate = await readFile(join(repoRoot, 'tests/network/fixtures/https-cert.pem'))
  const key = await readFile(join(repoRoot, 'tests/network/fixtures/https-key.pem'))
  let connections = 0
  let requests = 0
  const server = createHttpsServer({ cert: certificate, key }, (request, response) => {
    requests = requests + 1
    const marker = request.headers['x-inox-https-keep-alive']
    const first = request.url === '/first'
    const second = request.url === '/second'
    const valid = request.method === 'GET' && marker === nonce && (first || second)

    response.statusCode = valid ? 200 : 400
    response.setHeader('Content-Type', 'text/plain')

    if (second) {
      response.setHeader('Connection', 'close')
    }

    response.end(valid ? `https-keep-alive-${first ? 'first' : 'second'} ${nonce}` : 'invalid keep-alive request')
  })

  server.on('secureConnection', () => {
    connections = connections + 1
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить HTTPS keep-alive client server')
  return {
    server,
    port: address.port,
    stats: () => ({ connections, requests })
  }
}

async function startHttpKeepAliveClientServer(nonce: string): Promise<{
  readonly server: HttpServer
  readonly port: number
  readonly stats: () => { readonly connections: number; readonly requests: number }
}> {
  let connections = 0
  let requests = 0
  const server = createHttpServer((request, response) => {
    requests = requests + 1
    const marker = request.headers['x-inox-keep-alive']
    const first = request.url === '/first'
    const second = request.url === '/second'
    const valid = request.method === 'GET' && marker === nonce && (first || second)

    response.statusCode = valid ? 200 : 400
    response.setHeader('Content-Type', 'text/plain')

    if (second) {
      response.setHeader('Connection', 'close')
    }

    response.end(valid ? `keep-alive-${first ? 'first' : 'second'} ${nonce}` : 'invalid keep-alive request')
  })

  server.on('connection', () => {
    connections = connections + 1
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить keep-alive HTTP client server')
  return {
    server,
    port: address.port,
    stats: () => ({ connections, requests })
  }
}

async function startHttpStreamingClientServer(nonce: string): Promise<{
  readonly server: HttpServer
  readonly port: number
  readonly stats: () => {
    readonly connections: number
    readonly requests: number
    readonly chunked: boolean
    readonly fixed: boolean
  }
}> {
  let connections = 0
  let requests = 0
  let chunked = false
  let fixed = false
  const server = createHttpServer((request, response) => {
    requests = requests + 1
    let body = ''
    let chunks = 0
    let firstChunkAt = 0
    let lastChunkAt = 0

    request.setEncoding('utf8')
    request.on('data', (data) => {
      const now = Date.now()

      if (chunks === 0) {
        firstChunkAt = now
      }

      chunks = chunks + 1
      lastChunkAt = now
      body = body + data
    })
    request.on('end', () => {
      const separated = chunks >= 2 && lastChunkAt - firstChunkAt >= 100

      if (request.url === '/chunked') {
        chunked =
          separated &&
          request.headers['transfer-encoding'] === 'chunked' &&
          request.headers['content-length'] === undefined &&
          body === 'chunked ' + nonce + ' body'
      }

      if (request.url === '/fixed') {
        const expected = 'fixed ' + nonce + ' body'
        fixed =
          separated &&
          request.headers['transfer-encoding'] === undefined &&
          request.headers['content-length'] === String(expected.length) &&
          body === expected
        response.setHeader('Connection', 'close')
      }

      const valid = request.url === '/chunked' ? chunked : request.url === '/fixed' ? fixed : false
      response.statusCode = valid ? 200 : 400
      response.end(
        valid
          ? request.url === '/chunked'
            ? 'http-streaming-chunked-ok ' + nonce
            : 'http-streaming-fixed-ok ' + nonce
          : 'invalid HTTP streaming request'
      )
    })
  })

  server.on('connection', () => {
    connections = connections + 1
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить HTTP streaming client server')
  return {
    server,
    port: address.port,
    stats: () => ({ connections, requests, chunked, fixed })
  }
}

async function startHttpsStreamingClientServer(nonce: string): Promise<{
  readonly server: HttpsServer
  readonly port: number
  readonly stats: () => { readonly requests: number; readonly chunked: boolean }
}> {
  const certificate = await readFile(join(repoRoot, 'tests/network/fixtures/https-cert.pem'))
  const key = await readFile(join(repoRoot, 'tests/network/fixtures/https-key.pem'))
  let requests = 0
  let chunked = false
  const server = createHttpsServer({ cert: certificate, key }, (request, response) => {
    requests = requests + 1
    let body = ''
    let chunks = 0
    let firstChunkAt = 0
    let lastChunkAt = 0

    request.setEncoding('utf8')
    request.on('data', (data) => {
      const now = Date.now()

      if (chunks === 0) {
        firstChunkAt = now
      }

      chunks = chunks + 1
      lastChunkAt = now
      body = body + data
    })
    request.on('end', () => {
      chunked =
        request.url === '/chunked' &&
        chunks >= 2 &&
        lastChunkAt - firstChunkAt >= 100 &&
        request.headers['transfer-encoding'] === 'chunked' &&
        request.headers['content-length'] === undefined &&
        body === 'secure ' + nonce + ' body'
      response.statusCode = chunked ? 200 : 400
      response.setHeader('Connection', 'close')
      response.end(chunked ? 'https-streaming-ok ' + nonce : 'invalid HTTPS streaming request')
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить HTTPS streaming client server')
  return {
    server,
    port: address.port,
    stats: () => ({ requests, chunked })
  }
}

type RawHttpConnection = {
  readonly request: (chunks: string[]) => Promise<string>
  readonly waitForClose: () => Promise<void>
}

async function openRawHttpConnection(port: number): Promise<RawHttpConnection> {
  const socket = connectNetSocket(port, '127.0.0.1')
  let buffered = ''
  let pendingResolve: ((response: string) => void) | undefined
  let pendingReject: ((error: Error) => void) | undefined
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => resolve())
  })

  function flushResponse(): void {
    if (!pendingResolve) {
      return
    }

    const headerEnd = buffered.indexOf('\r\n\r\n')

    if (headerEnd < 0) {
      return
    }

    const header = buffered.slice(0, headerEnd + 4)
    const match = /(?:^|\r\n)Content-Length:\s*(\d+)\r\n/i.exec(header)

    if (!match?.[1]) {
      const reject = pendingReject
      pendingResolve = undefined
      pendingReject = undefined
      reject?.(new Error(`HTTP response has no Content-Length:\n${header}`))
      return
    }

    const bodyLength = Number(match[1])
    const responseLength = headerEnd + 4 + bodyLength

    if (buffered.length < responseLength) {
      return
    }

    const response = buffered.slice(0, responseLength)
    buffered = buffered.slice(responseLength)
    const resolve = pendingResolve
    pendingResolve = undefined
    pendingReject = undefined
    resolve(response)
  }

  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    buffered = buffered + chunk
    flushResponse()
  })
  socket.on('error', (error) => {
    const reject = pendingReject
    pendingResolve = undefined
    pendingReject = undefined
    reject?.(error)
  })
  await once(socket, 'connect')

  return {
    request: async (chunks) => {
      assert.ok(!pendingResolve, 'raw HTTP connection already has a pending request')
      const response = new Promise<string>((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject
      })

      for (const chunk of chunks) {
        socket.write(chunk)
        await delay(5)
      }

      flushResponse()
      return await Promise.race([
        response,
        delay(2_000).then(() => {
          throw new Error('keep-alive HTTP response timeout')
        })
      ])
    },
    waitForClose: async () => {
      await Promise.race([
        closed,
        delay(2_000).then(() => {
          throw new Error('keep-alive HTTP connection did not close')
        })
      ])
    }
  }
}

async function checkHttpKeepAliveServer(port: number, nonce: string): Promise<void> {
  const http11 = await openRawHttpConnection(port)
  const first = await http11.request([
    'POST /first HTTP/1.1\r\n' + 'Host: 127.0.0.1\r\n' + 'Content-Length: ' + String(nonce.length) + '\r\n\r\n' + nonce
  ])
  assert.match(first, /^HTTP\/1\.1 200 /)
  assert.match(first, /\r\nConnection: keep-alive\r\n/i)
  assert.ok(first.endsWith('/first'))

  const chunked = await http11.request([
    'POST /chunked HTTP/1.1\r\n' + 'Host: 127.0.0.1\r\n' + 'Transfer-Encoding: chunked\r\n\r\n' + '8\r\nchunked \r\n',
    nonce.length.toString(16) + '\r\n' + nonce + '\r\n0\r\n\r\n'
  ])
  assert.match(chunked, /\r\nConnection: keep-alive\r\n/i)
  assert.ok(chunked.endsWith('/chunked'))

  const closing = await http11.request(['GET /close HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'])
  assert.match(closing, /\r\nConnection: close\r\n/i)
  await http11.waitForClose()

  const pipelined = await openRawHttpConnection(port)
  const pipelinedFirst = await pipelined.request([
    'GET /pipelined-first HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n' +
      'GET /pipelined-close HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
  ])
  assert.match(pipelinedFirst, /\r\nConnection: keep-alive\r\n/i)
  assert.ok(pipelinedFirst.endsWith('/pipelined-first'))
  const pipelinedClosing = await pipelined.request([])
  assert.match(pipelinedClosing, /\r\nConnection: close\r\n/i)
  assert.ok(pipelinedClosing.endsWith('/pipelined-close'))
  await pipelined.waitForClose()

  const http10Close = await openRawHttpConnection(port)
  const legacyClosing = await http10Close.request(['GET /http10-close HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n'])
  assert.match(legacyClosing, /\r\nConnection: close\r\n/i)
  await http10Close.waitForClose()

  const http10KeepAlive = await openRawHttpConnection(port)
  const legacyFirst = await http10KeepAlive.request([
    'GET /http10-first HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n'
  ])
  assert.match(legacyFirst, /\r\nConnection: keep-alive\r\n/i)

  const idle = await openRawHttpConnection(port)
  const idleResponse = await idle.request(['GET /idle HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'])
  assert.match(idleResponse, /\r\nConnection: keep-alive\r\n/i)

  const shutdown = await http10KeepAlive.request([
    'GET /shutdown HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
  ])
  assert.match(shutdown, /\r\nConnection: close\r\n/i)
  await http10KeepAlive.waitForClose()
  await idle.waitForClose()
}

type StreamingHttpResponse = {
  readonly body: string
  readonly contentLength: string | undefined
  readonly transferEncoding: string | undefined
  readonly chunks: number
  readonly gap: number
  readonly statusCode: number | undefined
}

async function readStreamingHttpResponse(port: number, path: string): Promise<StreamingHttpResponse> {
  return await new Promise<StreamingHttpResponse>((resolve, reject) => {
    const request = getHttp(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { Connection: 'close' }
      },
      (response) => {
        let body = ''
        let chunks = 0
        let firstChunkAt = 0
        let lastChunkAt = 0

        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          const now = Date.now()

          if (chunks === 0) {
            firstChunkAt = now
          }

          chunks = chunks + 1
          lastChunkAt = now
          body = body + chunk
        })
        response.on('end', () => {
          resolve({
            body,
            contentLength: response.headers['content-length'],
            transferEncoding: response.headers['transfer-encoding'],
            chunks,
            gap: lastChunkAt - firstChunkAt,
            statusCode: response.statusCode
          })
        })
      }
    )

    request.on('error', reject)
  })
}

async function checkHttpStreamingServer(port: number, nonce: string): Promise<void> {
  const chunked = await readStreamingHttpResponse(port, '/chunked')
  assert.equal(chunked.statusCode, 200)
  assert.equal(chunked.transferEncoding, 'chunked')
  assert.equal(chunked.contentLength, undefined)
  assert.equal(chunked.body, 'chunked ' + nonce + ' body')
  assert.ok(chunked.chunks >= 2 && chunked.gap >= 100, 'Chunked server response был буферизован до end()')

  const fixed = await readStreamingHttpResponse(port, '/fixed')
  assert.equal(fixed.statusCode, 200)
  assert.equal(fixed.transferEncoding, undefined)
  assert.equal(fixed.contentLength, String(fixed.body.length))
  assert.equal(fixed.body, 'fixed ' + nonce + ' body')
  assert.ok(fixed.chunks >= 2 && fixed.gap >= 100, 'Content-Length server response был буферизован до end()')

  const invalid = await readStreamingHttpResponse(port, '/invalid')
  assert.equal(invalid.statusCode, 200)
  assert.equal(invalid.contentLength, '1')
  assert.equal(invalid.body, 'a')

  const legacy = await sendRawHttpRequest(port, [
    'GET /legacy HTTP/1.0\r\n' + 'Host: 127.0.0.1\r\n' + 'Connection: close\r\n' + '\r\n'
  ])
  assert.match(legacy, /^HTTP\/1\.0 200 /)
  assert.doesNotMatch(legacy, /\r\n(?:Content-Length|Transfer-Encoding):/i)
  assert.ok(legacy.endsWith('legacy ' + nonce + ' body'))

  const shutdown = await sendRawHttpRequest(port, [
    'GET /shutdown HTTP/1.1\r\n' + 'Host: 127.0.0.1\r\n' + 'Connection: close\r\n' + '\r\n'
  ])
  assert.match(shutdown, /^HTTP\/1\.1 200 /)
}

async function sendIncomingStreamingRequest(port: number, headers: string, chunks: string[]): Promise<string> {
  const socket = connectNetSocket(port, '127.0.0.1')
  let response = ''
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => resolve())
  })

  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    response = response + chunk
  })
  socket.on('error', () => {})
  await once(socket, 'connect')
  socket.write(headers)

  for (let attempt = 0; attempt < 50 && !response.includes('\r\n\r\nready '); attempt = attempt + 1) {
    await delay(20)
  }

  assert.ok(
    response.includes('\r\n\r\nready '),
    `HTTP handler не ответил после заголовков, до завершения request body:\n${response}`
  )

  for (const chunk of chunks) {
    socket.write(chunk)
    await delay(150)
  }

  const completed = await Promise.race([closed.then(() => true), delay(2_000).then(() => false)])

  if (!completed) {
    socket.destroy()
    await closed
  }

  assert.ok(completed, 'streaming HTTP request не завершился')
  return response
}

async function checkHttpIncomingStreamingServer(port: number, nonce: string): Promise<void> {
  const fixedBody = `fixed ${nonce} body`
  const fixedSplit = Math.max(1, Math.floor(fixedBody.length / 2))
  const fixed = await sendIncomingStreamingRequest(
    port,
    'POST /fixed HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      `Content-Length: ${fixedBody.length}\r\n` +
      'Connection: close\r\n' +
      '\r\n',
    [fixedBody.slice(0, fixedSplit), fixedBody.slice(fixedSplit)]
  )
  assert.match(fixed, /^HTTP\/1\.1 200 /)
  assert.ok(fixed.endsWith('ready ok'))

  const chunkedBody = `chunked ${nonce} body`
  const chunkedSplit = Math.max(1, Math.floor(chunkedBody.length / 2))
  const first = chunkedBody.slice(0, chunkedSplit)
  const second = chunkedBody.slice(chunkedSplit)
  const chunked = await sendIncomingStreamingRequest(
    port,
    'POST /chunked HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      'Connection: close\r\n' +
      '\r\n',
    [`${first.length.toString(16)}\r\n${first}\r\n`, `${second.length.toString(16)}\r\n${second}\r\n0\r\n\r\n`]
  )
  assert.match(chunked, /^HTTP\/1\.1 200 /)
  assert.ok(chunked.endsWith('ready ok'))

  const shutdown = await sendRawHttpRequest(port, [
    'GET /shutdown HTTP/1.1\r\n' + 'Host: 127.0.0.1\r\n' + 'Connection: close\r\n' + '\r\n'
  ])
  assert.match(shutdown, /^HTTP\/1\.1 200 /)
}

async function requestHttpsServer(
  port: number,
  path: string,
  method: string,
  headers: Record<string, string>,
  bodyChunks: string[]
): Promise<{
  readonly statusCode: number
  readonly headers: Record<string, string | string[] | undefined>
  readonly body: string
}> {
  return await new Promise((resolve, reject) => {
    const request = requestHttps(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers,
        rejectUnauthorized: false
      },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body = body + chunk
        })
        response.on('end', () => {
          resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body })
        })
      }
    )

    request.on('error', reject)

    let chunkIndex = 0
    const sendNext = (): void => {
      if (chunkIndex >= bodyChunks.length) {
        request.end()
        return
      }

      request.write(bodyChunks[chunkIndex])
      chunkIndex = chunkIndex + 1
      setTimeout(sendNext, 150)
    }

    sendNext()
  })
}

async function checkHttpsServer(port: number, nonce: string): Promise<void> {
  const body = `https-server-body ${nonce}`
  const split = Math.max(1, Math.floor(body.length / 2))
  const response = await requestHttpsServer(
    port,
    '/network',
    'POST',
    {
      'Content-Length': String(body.length),
      'X-Inox-Https-Server': nonce
    },
    [body.slice(0, split), body.slice(split)]
  )

  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
  assert.equal(response.headers['x-inox-https-server'], nonce)
  assert.equal(response.body, `https-server-ok ${nonce}`)

  const shutdown = await requestHttpsServer(port, '/shutdown', 'GET', { Connection: 'close' }, [])
  assert.equal(shutdown.statusCode, 200)
  assert.equal(shutdown.body, 'shutdown')
}

async function checkChunkedHttpServer(port: number, nonce: string): Promise<void> {
  const prefix = 'chunked '
  const suffixStart = Math.min(3, nonce.length)
  const requestHeaders =
    'POST /chunked HTTP/1.1\r\n' +
    'Host: 127.0.0.1\r\n' +
    'Transfer-Encoding: chunked\r\n' +
    'Trailer: X-Inox-Trailer\r\n' +
    'X-Inox-Test: ' +
    nonce +
    '\r\n' +
    'Connection: close\r\n' +
    '\r\n'
  const response = await sendRawHttpRequest(port, [
    requestHeaders + prefix.length.toString(16) + ';mode=test\r',
    '\n' + prefix + '\r\n' + nonce.length.toString(16) + '\r\n' + nonce.slice(0, suffixStart),
    nonce.slice(suffixStart) + '\r\n0\r\nX-Inox-Trailer: complete\r',
    '\n\r\n'
  ])

  assert.match(response, /^HTTP\/1\.1 200 /)
  assert.ok(response.endsWith(`chunked-server-ok ${nonce}`), `Неожиданный chunked response:\n${response}`)

  const conflicting = await sendRawHttpRequest(port, [
    'POST /conflicting HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      'Content-Length: 1\r\n' +
      'Connection: close\r\n' +
      '\r\n' +
      '0\r\n\r\n'
  ])
  assert.match(conflicting, /^HTTP\/1\.1 400 /)

  const malformed = await sendRawHttpRequest(port, [
    'POST /malformed HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      'Connection: close\r\n' +
      '\r\n' +
      'z\r\ninvalid\r\n0\r\n\r\n'
  ])
  assert.match(malformed, /^HTTP\/1\.1 400 /)

  const oversized = await sendRawHttpRequest(port, [
    'POST /oversized HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      'Connection: close\r\n' +
      '\r\n' +
      '10000\r\n'
  ])
  assert.match(oversized, /^HTTP\/1\.1 413 /)

  const forbiddenTrailer = await sendRawHttpRequest(port, [
    'POST /forbidden-trailer HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      'Connection: close\r\n' +
      '\r\n' +
      '1\r\na\r\n0\r\nContent-Length: 1\r\n\r\n'
  ])
  assert.match(forbiddenTrailer, /^HTTP\/1\.1 400 /)

  const truncated = await sendRawHttpRequest(
    port,
    [
      'POST /truncated HTTP/1.1\r\n' +
        'Host: 127.0.0.1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        'Connection: close\r\n' +
        '\r\n' +
        '5\r\nabc'
    ],
    true
  )
  assert.doesNotMatch(truncated, /^HTTP\/1\.1 200 /)

  const shutdown = await sendRawHttpRequest(port, [
    'GET /shutdown HTTP/1.1\r\n' + 'Host: 127.0.0.1\r\n' + 'Connection: close\r\n' + '\r\n'
  ])
  assert.match(shutdown, /^HTTP\/1\.1 200 /)
}

async function sendRawHttpRequest(port: number, chunks: string[], finish = false): Promise<string> {
  const socket = connectNetSocket(port, '127.0.0.1')
  let response = ''
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => resolve())
  })

  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    response += chunk
  })
  socket.on('error', () => {})
  await once(socket, 'connect')

  for (const chunk of chunks) {
    socket.write(chunk)
    await delay(5)
  }

  if (finish) {
    socket.end()
  }

  const completed = await Promise.race([closed.then(() => true), delay(2_000).then(() => false)])

  if (!completed) {
    socket.destroy()
    await closed
  }

  assert.ok(completed, 'raw HTTP request не завершился')
  return response
}

async function startInvalidChunkedServer(): Promise<{ server: NetServer; port: number }> {
  const server = createNetServer((socket) => {
    socket.once('data', (data) => {
      const request = String(data)

      if (request.includes(' /conflicting ')) {
        socket.end(
          'HTTP/1.1 200 OK\r\n' +
            'Transfer-Encoding: chunked\r\n' +
            'Content-Length: 1\r\n' +
            'Connection: close\r\n' +
            '\r\n' +
            '1\r\nx\r\n0\r\n\r\n'
        )
        return
      }

      socket.end(
        'HTTP/1.1 200 OK\r\n' + 'Transfer-Encoding: chunked\r\n' + 'Connection: close\r\n' + '\r\n' + '5\r\nabc'
      )
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить invalid chunked test server')
  return { server, port: address.port }
}

async function startHttpChunkedServer(nonce: string): Promise<{ server: HttpServer; port: number }> {
  const server = createHttpServer((request, response) => {
    const marker = request.headers['x-inox-chunked']
    const valid = request.method === 'GET' && request.url === '/chunked' && marker === nonce
    const prefix = valid ? 'http-chunked-' : 'http-failed-'
    const suffix = valid ? `ok ${nonce}` : 'response'

    response.statusCode = valid ? 200 : 400
    response.setHeader('X-Inox-Chunked', typeof marker === 'string' ? marker : '')
    response.setHeader('Transfer-Encoding', 'chunked')
    response.setHeader('Trailer', 'X-Inox-Trailer')
    response.flushHeaders()
    response.write(prefix)
    setTimeout(() => {
      response.addTrailers({ 'X-Inox-Trailer': 'complete' })
      response.end(suffix)
    }, 5)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить chunked HTTP test server')
  return { server, port: address.port }
}

async function startHttpsServer(nonce: string): Promise<{ server: HttpsServer; port: number }> {
  const certificate = await readFile(join(repoRoot, 'tests/network/fixtures/https-cert.pem'))
  const key = await readFile(join(repoRoot, 'tests/network/fixtures/https-key.pem'))
  const server = createHttpsServer({ cert: certificate, key }, (request, response) => {
    const marker = request.headers['x-inox-https']
    const valid = request.method === 'GET' && request.url === '/secure' && marker === nonce
    const prefix = valid ? 'https-chunked-' : 'https-failed-'
    const suffix = valid ? `ok ${nonce}` : 'response'

    response.statusCode = valid ? 200 : 400
    response.setHeader('X-Inox-Https', typeof marker === 'string' ? marker : '')
    response.setHeader('Transfer-Encoding', 'chunked')
    response.setHeader('Trailer', 'X-Inox-Trailer')
    response.flushHeaders()
    response.write(prefix)
    setTimeout(() => {
      response.addTrailers({ 'X-Inox-Trailer': 'complete' })
      response.end(suffix)
    }, 5)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось запустить HTTPS test server')
  return { server, port: address.port }
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return
  }

  const closed = once(server, 'close')
  server.close()
  await closed
}

async function closeNetServer(server: NetServer): Promise<void> {
  if (!server.listening) {
    return
  }

  const closed = once(server, 'close')
  server.close()
  await closed
}

async function closeHttpsServer(server: HttpsServer): Promise<void> {
  if (!server.listening) {
    return
  }

  const closed = once(server, 'close')
  server.close()
  await closed
}

async function buildExecutable(): Promise<void> {
  await rm(buildRoot, { recursive: true, force: true })

  const command = compilerMode === 'hosted' ? process.execPath : join(repoRoot, 'dist/inox')
  const compilerArguments = compilerMode === 'hosted' ? ['compiler/index.ts', 'build'] : ['build']
  const result = await runCommand(
    command,
    [...compilerArguments, 'tests/network/fixtures/index.ts', '--out-dir', buildRoot, '--name', 'network-acceptance'],
    {
      cwd: repoRoot,
      stdout: process.stdout,
      stderr: process.stderr
    }
  )

  assert.equal(result.code, 0, `${compilerMode} compiler build завершился с кодом ${result.code}`)
}

async function waitForLine(
  application: ChildProcessWithoutNullStreams,
  expected: string,
  stdout: () => string,
  stderr: () => string
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt = attempt + 1) {
    assertProcessIsAlive(application, stdout(), stderr())

    if (stdout().split(/\r?\n/).includes(expected)) {
      return
    }

    await delay(100)
  }

  assert.fail(processFailure(`не получена строка готовности ${expected}`, stdout(), stderr()))
}

async function fetchWithTimeout(url: string, milliseconds: number, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, milliseconds)

  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function reservePort(): Promise<number> {
  const reservation = createNetServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')

  const address = reservation.address()
  assert.ok(address !== null && typeof address !== 'string', 'Не удалось выделить TCP port')
  const port = address.port
  const closed = once(reservation, 'close')
  reservation.close()
  await closed
  return port
}

async function stopProcess(application: ChildProcessWithoutNullStreams): Promise<void> {
  if (application.exitCode !== null || application.signalCode !== null) {
    return
  }

  application.kill('SIGTERM')
  if (await waitForExit(application, 2_000)) {
    return
  }

  application.kill('SIGKILL')
  assert.ok(await waitForExit(application, 2_000), 'network executable не завершился после SIGKILL')
}

async function waitForExit(application: ChildProcessWithoutNullStreams, milliseconds: number): Promise<boolean> {
  if (application.exitCode !== null || application.signalCode !== null) {
    return true
  }

  return Promise.race([once(application, 'exit').then(() => true), delay(milliseconds).then(() => false)])
}

function assertProcessIsAlive(application: ChildProcessWithoutNullStreams, stdout: string, stderr: string): void {
  if (application.exitCode !== null || application.signalCode !== null) {
    assert.fail(processFailure('network executable завершился до готовности HTTP', stdout, stderr))
  }
}

function processFailure(message: string, stdout: string, stderr: string): string {
  return `${message}\nstdout: ${stdout}\nstderr: ${stderr}`
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

await main()
