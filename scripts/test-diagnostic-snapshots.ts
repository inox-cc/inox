import { join } from 'node:path'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileSource } from '../src/compiler/index.ts'
import type { Diagnostic } from '../src/compiler/types.ts'
import { rootDir } from './lib/repo-checks.ts'
import { runSnapshotSuite, type SnapshotOutput } from './lib/snapshot-runner.ts'

type DiagnosticSnapshot = {
  target: 'js'
  diagnostics: Diagnostic[]
}

const snapshotRoot = join(rootDir, 'tests/snapshots/diagnostics')
const update = process.argv.includes('--update')

await runSnapshotSuite({
  title: 'Diagnostic snapshot checks',
  root: snapshotRoot,
  sourceSuffix: '.ts',
  update,
  updateCommand: 'node scripts/test-diagnostic-snapshots.ts --update',
  createOutputs: ({ path, source }) => {
    return [createDiagnosticOutput(path, source)]
  }
})

function createDiagnosticOutput(path: string, source: string): SnapshotOutput {
  return {
    path: path.replace(/\.ts$/, '.diagnostics.json'),
    content: `${JSON.stringify(createDiagnosticSnapshot(source), null, 2)}\n`
  }
}

function createDiagnosticSnapshot(source: string): DiagnosticSnapshot {
  try {
    compileSource(source, {
      target: 'js',
      callMain: false
    })
  } catch (error) {
    if (error instanceof CompileError) {
      return {
        target: 'js',
        diagnostics: error.diagnostics.map(snapshotDiagnostic)
      }
    }

    throw error
  }

  throw new Error('Expected diagnostic snapshot source to fail compilation')
}

function snapshotDiagnostic(item: Diagnostic): Diagnostic {
  return {
    code: item.code,
    message: item.message,
    line: item.line,
    column: item.column,
    severity: item.severity
  }
}
