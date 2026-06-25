import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:tls'
import { fileURLToPath } from 'node:url'
import { compileSource } from '../../compiler/index.ts'

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export { assert, compileSource, join, mkdir, readFile, rm, writeFile }

export async function createTestTempDir(prefix: string): Promise<string> {
  const root = join(repoRoot, 'dist/test-tmp')

  await mkdir(root, {
    recursive: true
  })

  return await mkdtemp(join(root, prefix))
}

export function compileRuntimeProgram(
  source: string,
  output: string,
  extraArgs: string[] = []
): Promise<CommandResult> {
  return runCommand('cc', [
    '-Iruntime/include',
    ...extraArgs,
    source,
    'runtime/src/core/value.c',
    'runtime/src/core/allocator.c',
    'runtime/src/core/callback.c',
    'runtime/src/core/debug.c',
    'runtime/src/binary/binary.c',
    'runtime/src/crypto/crypto.c',
    'runtime/src/core/weak.c',
    'runtime/src/async/loop.c',
    'runtime/src/async/promise.c',
    'runtime/src/strings/string.c',
    'runtime/src/child_process/child_process.c',
    'runtime/src/objects/object.c',
    'runtime/src/arrays/array.c',
    'runtime/src/collections/map.c',
    'runtime/src/collections/set.c',
    'runtime/src/console/console.c',
    'runtime/src/fs/fs.c',
    'runtime/src/json/json.c',
    'runtime/src/os/os.c',
    'runtime/src/path/path.c',
    'runtime/src/process/process.c',
    'runtime/src/time/time.c',
    'runtime/src/url/url.c',
    '-o',
    output
  ])
}

export async function generateLocalhostCertificate(keyPath: string, certPath: string): Promise<void> {
  const result = await runCommand('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost'
  ])

  assert.equal(result.code, 0, result.stderr)
}

export async function startLocalTlsServer(
  keyPath: string,
  certPath: string
): Promise<{ port: number; close: () => Promise<void> }> {
  const key = await readFile(keyPath)
  const cert = await readFile(certPath)
  const server = createServer(
    {
      key,
      cert
    },
    (socket) => {
      socket.on('data', () => {
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
      })
    }
  )

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  assert.notEqual(port, 0)

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
  }
}

export function isLocalListenUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EADDRNOTAVAIL')
  )
}

export function runCommand(
  command: string,
  args: string[],
  options: { env?: Record<string, string | undefined> } = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let spawnError: Error | null = null

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', (code) => {
      resolve({
        code: spawnError ? 127 : (code ?? 1),
        stdout,
        stderr: spawnError ? `${stderr}${spawnError.message}` : stderr
      })
    })
  })
}
