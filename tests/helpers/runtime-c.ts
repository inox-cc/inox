import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:tls'
import { fileURLToPath } from 'node:url'
import { compileSource } from '../../src/compiler/index.ts'

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export { assert, compileSource, join, mkdir, mkdtemp, readFile, rm, tmpdir, writeFile }

export function compileRuntimeProgram(
  source: string,
  output: string,
  extraArgs: string[] = []
): Promise<CommandResult> {
  return runCommand('cc', [
    '-Iruntime/c/include',
    ...extraArgs,
    source,
    'runtime/c/src/core/value.c',
    'runtime/c/src/core/allocator.c',
    'runtime/c/src/core/callback.c',
    'runtime/c/src/core/debug.c',
    'runtime/c/src/binary/binary.c',
    'runtime/c/src/crypto/crypto.c',
    'runtime/c/src/core/weak.c',
    'runtime/c/src/async/loop.c',
    'runtime/c/src/async/promise.c',
    'runtime/c/src/strings/string.c',
    'runtime/c/src/objects/object.c',
    'runtime/c/src/arrays/array.c',
    'runtime/c/src/collections/map.c',
    'runtime/c/src/collections/set.c',
    'runtime/c/src/console/console.c',
    'runtime/c/src/fs/fs.c',
    'runtime/c/src/json/json.c',
    'runtime/c/src/path/path.c',
    'runtime/c/src/process/process.c',
    'runtime/c/src/time/time.c',
    'runtime/c/src/url/url.c',
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
  const port = typeof address === 'object' && address != null ? address.port : 0

  assert.notEqual(port, 0)

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error != null) {
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

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      resolve({
        code: 127,
        stdout,
        stderr: error.message
      })
    })
    child.on('exit', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}
