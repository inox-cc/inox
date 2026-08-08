import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { createServer as createNetServer, type Server as NetServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCommand } from './lib/run-command.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const compilerMode = process.argv[2] === 'hosted' ? 'hosted' : 'native'
const buildRoot = join(repoRoot, 'dist/network', `acceptance-${compilerMode}-${process.pid}`)
const executable = join(buildRoot, 'bin', 'network-acceptance')

async function main(): Promise<void> {
  const port = await reservePort()
  const nonce = `network-${process.pid}-${Date.now()}`

  await buildExecutable()
  const httpChunkedServer = await startHttpChunkedServer(nonce)
  const invalidChunkedServer = await startInvalidChunkedServer()
  const httpsServer = await startHttpsServer(nonce)

  const application = spawn(
    executable,
    [
      String(port),
      nonce,
      String(httpsServer.port),
      String(httpChunkedServer.port),
      String(invalidChunkedServer.port)
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
    assert.ok(lines.includes('INOX_HTTPS_CLIENT_OK'), processFailure('HTTPS client не получил ответ', stdout, stderr))
  } finally {
    await stopProcess(application)
    await closeHttpServer(httpChunkedServer.server)
    await closeNetServer(invalidChunkedServer.server)
    await closeHttpsServer(httpsServer.server)
    await rm(buildRoot, { recursive: true, force: true })
  }
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
        'HTTP/1.1 200 OK\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        'Connection: close\r\n' +
        '\r\n' +
        '5\r\nabc'
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
