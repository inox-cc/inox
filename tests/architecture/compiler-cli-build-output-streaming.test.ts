import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('hosted и self-hosted build adapters выводят command output до завершения процесса', async () => {
  const hostModule = pathToFileURL(resolve('scripts/lib/compiler-cli-host.ts')).href
  const delayedCommand =
    "process.stdout.write('first\\n'); setTimeout(() => process.stdout.write('second\\n'), 1500)"
  const outerSource =
    `import { runHostCommand } from ${JSON.stringify(hostModule)}\n` +
    `const result = runHostCommand(process.execPath, ['--eval', ${JSON.stringify(delayedCommand)}], process.cwd())\n` +
    "process.stdout.write(`captured:${result.stdout.length}:${result.stderr.length}\\n`)\n"
  const child = spawn(process.execPath, ['--input-type=module', '--eval', outerSource], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let firstOutput: (() => void) | null = null
  const firstSeen = new Promise<void>((resolveFirst) => {
    firstOutput = resolveFirst
  })

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk)

    if (stdout.includes('first\n') && firstOutput !== null) {
      firstOutput()
      firstOutput = null
    }
  })

  const streamed = await Promise.race([firstSeen.then(() => true), delay(500).then(() => false)])
  const exit = await once(child, 'exit')

  assert.equal(streamed, true)
  assert.equal(exit[0], 0)
  assert.equal(stdout, 'first\nsecond\ncaptured:0:0\n')

  const nativeEntry = renderCompilerLibraryRegistry([]).nativeEntrySource
  const commandStart = nativeEntry.indexOf('  runCommand:')
  const programStart = nativeEntry.indexOf('  runProgram:')
  const commandAdapter = nativeEntry.slice(commandStart, programStart)

  assert.match(commandAdapter, /stdio: 'inherit'/)
  assert.doesNotMatch(commandAdapter, /result\.(?:stdout|stderr)/)
})

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds)
  })
}
