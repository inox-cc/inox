import { resolve } from 'node:path'

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

if (!probe.stdout.includes('Stage 6 semantic contract passed')) {
  console.error('Stage 6 semantic probe did not report a successful contract check')
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
