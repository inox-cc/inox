import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { createServer as createPortReservationServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCommand } from './lib/run-command.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const buildRoot = join(repoRoot, 'dist/network', `acceptance-native-${process.pid}`)
const executable = join(buildRoot, 'bin', 'network-acceptance')

async function main(): Promise<void> {
  const port = await reservePort()
  const nonce = `network-${process.pid}-${Date.now()}`

  await buildExecutable()

  const application = spawn(executable, [String(port), nonce], {
    cwd: repoRoot,
    stdio: 'pipe'
  })
  let stdout = ''
  let stderr = ''

  application.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  application.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  try {
    await waitForLine(application, `INOX_HTTP_READY ${nonce} ${port}`, () => stdout, () => stderr)

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
    assert.ok(lines.includes('INOX_HTTP_CLOSED'), processFailure('HTTP server не закрылся', stdout, stderr))
  } finally {
    await stopProcess(application)
    await rm(buildRoot, { recursive: true, force: true })
  }
}

async function buildExecutable(): Promise<void> {
  await rm(buildRoot, { recursive: true, force: true })

  const result = await runCommand(
    join(repoRoot, 'dist/inox'),
    [
      'build',
      'tests/network/fixtures/index.ts',
      '--out-dir',
      buildRoot,
      '--name',
      'network-acceptance'
    ],
    {
      cwd: repoRoot,
      stdout: process.stdout,
      stderr: process.stderr
    }
  )

  assert.equal(result.code, 0, `dist/inox build завершился с кодом ${result.code}`)
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

async function fetchWithTimeout(
  url: string,
  milliseconds: number,
  headers: Record<string, string>
): Promise<Response> {
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
