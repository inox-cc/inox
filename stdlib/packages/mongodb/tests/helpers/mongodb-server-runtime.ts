import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'

import { rootDir } from '../../../../../scripts/lib/repo-root.ts'
import { runCommand } from '../../../../../scripts/lib/run-command.ts'
import type { MongoBsonRuntimeCompiler } from './mongodb-bson-runtime.ts'

export interface MongoServerRuntimeCase {
  readonly name: string
  readonly resultPrefix: string
  readonly source: (port: number) => string
  readonly expectedLines: readonly string[]
}

export async function assertMongoServerRuntime(
  compiler: MongoBsonRuntimeCompiler,
  testCase: MongoServerRuntimeCase
): Promise<void> {
  if (!(await hasMongod())) {
    return
  }

  const workspace = join(rootDir, `dist/test-tmp/${testCase.name}-${compiler.label}`)
  const database = join(workspace, 'database')
  const log = join(workspace, 'mongod.log')
  const input = join(workspace, 'index.ts')
  const output = join(workspace, 'output')
  const port = await availablePort()
  let server: ChildProcess | null = null

  try {
    await rm(workspace, { recursive: true, force: true })
    await mkdir(database, { recursive: true })
    server = spawn(
      'mongod',
      ['--dbpath', database, '--port', String(port), '--bind_ip', '127.0.0.1', '--logpath', log],
      { stdio: 'ignore' }
    )
    await waitForMongoServer(server, log)
    await writeFile(input, testCase.source(port))

    const result = await runCommand(compiler.command, [
      ...compiler.args,
      'run',
      input,
      '--out-dir',
      output,
      '--name',
      testCase.name
    ])

    assert.equal(
      result.code,
      0,
      `${compiler.label} ${testCase.name} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    )
    assert.equal(result.stderr, '')
    assert.deepEqual(
      result.stdout.split('\n').filter((line) => line.startsWith(testCase.resultPrefix)),
      testCase.expectedLines
    )
  } finally {
    if (server !== null) {
      await stopMongoServer(server)
    }

    await rm(workspace, { recursive: true, force: true })
  }
}

async function hasMongod(): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn('mongod', ['--version'], { stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('mongodb test could not reserve a local port'))
        return
      }

      server.close((error) => {
        if (error !== null && typeof error !== 'undefined') {
          reject(error)
        } else {
          resolve(address.port)
        }
      })
    })
  })
}

async function waitForMongoServer(server: ChildProcess, log: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt = attempt + 1) {
    if (server.exitCode !== null) {
      break
    }

    try {
      const contents = await readFile(log, 'utf8')

      if (contents.includes('Waiting for connections')) {
        return
      }
    } catch {
      // The log file is created asynchronously by mongod.
    }

    await delay(25)
  }

  const contents = await readFile(log, 'utf8').catch(() => '')
  throw new Error(`mongod did not start\n${contents}`)
}

async function stopMongoServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) {
    return
  }

  server.kill('SIGINT')

  await Promise.race([
    new Promise<void>((resolve) => server.once('exit', () => resolve())),
    delay(5000).then(() => {
      server.kill('SIGKILL')
    })
  ])
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
