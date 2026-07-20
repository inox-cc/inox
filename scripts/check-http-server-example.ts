import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const compilerMode = process.argv[2] ?? 'node'

assert.ok(compilerMode === 'node' || compilerMode === 'native', `Неизвестный режим compiler: ${compilerMode}`)

const executable = join(repoRoot, 'dist/http-server', 'out', compilerMode, 'http-server')

async function main(): Promise<void> {
  const server = spawn(executable, [], {
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
    const health = await waitForServer(server, () => stdout, () => stderr)
    assert.equal(health.status, 200)
    assert.equal(health.headers.get('content-type'), 'application/json')
    assert.deepEqual(await health.json(), { ok: true })

    const page = await fetch('http://127.0.0.1:8080/')
    assert.equal(page.status, 200)
    assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8')
    assert.match(await page.text(), /<h1>inox HTTP server<\/h1>/)

    const text = await fetch('http://127.0.0.1:8080/hello.txt')
    assert.equal(text.status, 200)
    assert.equal(text.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.equal(await text.text(), 'Hello from inox HTTP static files.\n')
  } finally {
    await stopServer(server)
  }
}

async function waitForServer(
  server: ChildProcessWithoutNullStreams,
  stdout: () => string,
  stderr: () => string
): Promise<Response> {
  for (let attempt = 0; attempt < 50; attempt = attempt + 1) {
    if (server.exitCode !== null || server.signalCode !== null) {
      assert.fail(`HTTP server завершился до запуска\nstdout: ${stdout()}\nstderr: ${stderr()}`)
    }

    try {
      return await fetchWithTimeout('http://127.0.0.1:8080/health', 500)
    } catch {
      await delay(100)
    }
  }

  assert.fail(`HTTP server не начал принимать запросы\nstdout: ${stdout()}\nstderr: ${stderr()}`)
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

  const exited = once(server, 'exit')
  server.kill('SIGTERM')
  await exited
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

await main()
