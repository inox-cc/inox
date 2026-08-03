import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { createServer as createPortReservationServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCommand } from './lib/run-command.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const compilerMode = process.argv[2] ?? 'node'

assert.ok(compilerMode === 'node' || compilerMode === 'native', `Неизвестный режим compiler: ${compilerMode}`)

const buildRoot = join(repoRoot, 'dist/http-server', `acceptance-${compilerMode}-${process.pid}`)
const executable = join(buildRoot, 'bin', 'http-server')
const staticRoot = join(repoRoot, 'examples/http-server/public')

async function main(): Promise<void> {
  const port = await reservePort()
  const nonce = `${compilerMode}-${process.pid}-${Date.now()}`

  await buildFreshExecutable()

  const server = spawn(executable, [String(port), nonce, staticRoot], {
    cwd: repoRoot,
    stdio: 'pipe'
  })
  let stdout = ''
  let stderr = ''

  server.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  server.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  try {
    await waitForServer(
      server,
      nonce,
      port,
      () => stdout,
      () => stderr
    )

    const health = await fetchWithTimeout(`http://127.0.0.1:${port}/health`, 2_000)
    assert.equal(health.status, 200)
    assert.equal(health.headers.get('content-type'), 'application/json')
    assert.deepEqual(await health.json(), { ok: true, nonce })
    assertServerIsAlive(server, stdout, stderr)

    const page = await fetchWithTimeout(`http://127.0.0.1:${port}/`, 2_000)
    assert.equal(page.status, 200)
    assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8')
    assert.match(await page.text(), /<h1>inox HTTP server<\/h1>/)
    assertServerIsAlive(server, stdout, stderr)

    const text = await fetchWithTimeout(`http://127.0.0.1:${port}/hello.txt`, 2_000)
    assert.equal(text.status, 200)
    assert.equal(text.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.equal(await text.text(), 'Hello from inox HTTP static files.\n')
    assertServerIsAlive(server, stdout, stderr)
  } finally {
    await stopServer(server)
    await rm(buildRoot, { recursive: true, force: true })
  }
}

async function buildFreshExecutable(): Promise<void> {
  await rm(buildRoot, { recursive: true, force: true })
  const command = compilerMode === 'node' ? 'node' : join(repoRoot, 'dist/inox')
  const args = compilerMode === 'node' ? ['compiler/index.ts'] : []

  args.push(
    'build',
    'examples/http-server/index.ts',
    '--out-dir',
    buildRoot,
    '--name',
    'http-server'
  )
  await requireCommand(command, args)
}

async function requireCommand(command: string, args: string[]): Promise<void> {
  const result = await runCommand(command, args, {
    cwd: repoRoot,
    stdout: process.stdout,
    stderr: process.stderr
  })

  assert.equal(result.code, 0, `${command} ${args.join(' ')} завершился с кодом ${result.code}`)
}

async function waitForServer(
  server: ChildProcessWithoutNullStreams,
  nonce: string,
  port: number,
  stdout: () => string,
  stderr: () => string
): Promise<void> {
  const readyLine = `INOX_HTTP_READY ${nonce} ${port}`

  for (let attempt = 0; attempt < 50; attempt = attempt + 1) {
    assertServerIsAlive(server, stdout(), stderr())

    if (stdout().split(/\r?\n/).includes(readyLine)) {
      return
    }

    await delay(100)
  }

  assert.fail(`HTTP server не подтвердил готовность ${readyLine}\nstdout: ${stdout()}\nstderr: ${stderr()}`)
}

async function fetchWithTimeout(url: string, milliseconds: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, milliseconds)

  try {
    return await fetch(url, {
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function stopServer(server: ChildProcessWithoutNullStreams): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return
  }

  server.kill('SIGTERM')
  if (await waitForExit(server, 2_000)) {
    return
  }

  server.kill('SIGKILL')
  assert.ok(await waitForExit(server, 2_000), 'HTTP server не завершился после SIGKILL')
}

async function reservePort(): Promise<number> {
  const reservation = createPortReservationServer()
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

async function waitForExit(server: ChildProcessWithoutNullStreams, milliseconds: number): Promise<boolean> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return true
  }

  return Promise.race([once(server, 'exit').then(() => true), delay(milliseconds).then(() => false)])
}

function assertServerIsAlive(server: ChildProcessWithoutNullStreams, stdout: string, stderr: string): void {
  if (server.exitCode !== null || server.signalCode !== null) {
    assert.fail(`HTTP server завершился до конца проверки\nstdout: ${stdout}\nstderr: ${stderr}`)
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

await main()
