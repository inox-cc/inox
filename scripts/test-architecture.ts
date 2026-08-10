import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { collectTestFiles, discoverStdlibTestFiles } from './lib/stdlib-test-discovery.ts'
import { rootDir } from './lib/repo-root.ts'

const files = [
  ...(await collectTestFiles(join(rootDir, 'tests/architecture'))),
  ...(await discoverStdlibTestFiles('architecture'))
].sort()

assert.notEqual(files.length, 0, 'architecture tests: no .test.ts files found')

const child = spawn(process.execPath, ['--test', ...files], {
  cwd: rootDir,
  stdio: 'inherit'
})

const exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (signal !== null) {
      reject(new Error(`architecture test runner exited with signal ${signal}`))
      return
    }

    resolve(code ?? 1)
  })
})

process.exitCode = exitCode
