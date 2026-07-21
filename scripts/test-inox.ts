import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { runStage6SemanticContract } from '../tests/contracts/stage6-semantic-contract.ts'
import { rootDir } from './lib/repo-root.ts'
import { runCommand } from './lib/run-command.ts'

type TestInoxOptions = {
  compiler: string
  semanticProbe: string
}

const options = parseOptions(process.argv.slice(2))

if (options === null) {
  console.error(
    'Usage: node scripts/test-inox.ts --compiler dist/inox --semantic-probe dist/inox-stage6-semantic-probe'
  )
  process.exit(1)
}

const probe = await runCommand(resolve(rootDir, options.semanticProbe), [], {
  stderr: process.stderr,
  stdout: process.stdout
})

if (probe.code !== 0) {
  process.exit(probe.code)
}

const contractPrefix = 'INOX_DECOUPLING_CONTRACT '
const nativeSnapshotLine = probe.stdout
  .split('\n')
  .find((line) => line.startsWith(contractPrefix))

if (typeof nativeSnapshotLine === 'undefined') {
  console.error('Native decoupling probe did not report its semantic snapshot')
  process.exit(1)
}

const hostedContract = runStage6SemanticContract()

if (!hostedContract.ok) {
  for (const failure of hostedContract.failures) {
    console.error(failure)
  }

  process.exit(1)
}

const nativeSnapshot = nativeSnapshotLine.slice(contractPrefix.length)
let parsedNativeSnapshot: unknown

try {
  parsedNativeSnapshot = JSON.parse(nativeSnapshot)
} catch {
  console.error('Native decoupling probe reported invalid JSON')
  process.exit(1)
}

if (!isDeepStrictEqual(parsedNativeSnapshot, hostedContract.snapshot)) {
  console.error('Hosted and native compiler decoupling snapshots differ')
  process.exit(1)
}

const tests = await runCommand('node', ['tests/all.test.ts', '--compiler', options.compiler], {
  stderr: process.stderr,
  stdout: process.stdout
})

process.exitCode = tests.code

function parseOptions(args: string[]): TestInoxOptions | null {
  let compiler: string | null = null
  let semanticProbe: string | null = null

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]
    const value = args[index + 1]

    if ((arg !== '--compiler' && arg !== '--semantic-probe') || !value || value.startsWith('-')) {
      return null
    }

    index = index + 1

    if (arg === '--compiler') {
      compiler = value
    } else {
      semanticProbe = value
    }
  }

  if (compiler === null || semanticProbe === null) {
    return null
  }

  return { compiler, semanticProbe }
}
