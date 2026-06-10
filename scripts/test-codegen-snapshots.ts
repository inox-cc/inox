import { join } from 'node:path'
import { compileSource } from '../src/compiler/index.ts'
import type { CompileTarget } from '../src/compiler/types.ts'
import { rootDir } from './lib/repo-checks.ts'
import { runSnapshotSuite, type SnapshotOutput } from './lib/snapshot-runner.ts'

const snapshotRoot = join(rootDir, 'tests/snapshots/codegen')
const update = process.argv.includes('--update')
const targets: CompileTarget[] = ['ts', 'c']

await runSnapshotSuite({
  title: 'Codegen snapshot checks',
  root: snapshotRoot,
  sourceSuffix: '.input.ts',
  update,
  updateCommand: 'node scripts/test-codegen-snapshots.ts --update',
  createOutputs: ({ path, source }) => {
    return targets.map(target => createCodegenOutput(path, source, target))
  }
})

function createCodegenOutput(path: string, source: string, target: CompileTarget): SnapshotOutput {
  return {
    path: path.replace(/\.input\.ts$/, `.expected.${target}`),
    content: snapshotText(compileSource(source, {
      target,
      callMain: false
    }).code)
  }
}

function snapshotText(value: string): string {
  return `${value.trimEnd()}\n`
}
