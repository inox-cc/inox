import { join } from 'node:path'
import { compileSource } from '../compiler/index.ts'
import { rootDir } from './lib/repo-checks.ts'
import { runSnapshotSuite, type SnapshotOutput } from './lib/snapshot-runner.ts'

const snapshotRoot = join(rootDir, 'tests/snapshots/codegen')
const update = process.argv.includes('--update')

await runSnapshotSuite({
  title: 'Codegen snapshot checks',
  root: snapshotRoot,
  sourceSuffix: '.input.ts',
  update,
  updateCommand: 'node scripts/test-codegen-snapshots.ts --update',
  createOutputs: ({ path, source }) => {
    return [createCodegenOutput(path, source)]
  }
})

function createCodegenOutput(path: string, source: string): SnapshotOutput {
  return {
    path: path.replace(/\.input\.ts$/, '.expected.c'),
    content: snapshotText(
      compileSource(source, {
        target: 'c',
        callMain: false
      }).code
    )
  }
}

function snapshotText(value: string): string {
  return `${value.trimEnd()}\n`
}
