import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileFile } from '../src/compiler/index.ts'
import type { CompileTarget } from '../src/compiler/types.ts'
import { findFixtureFiles, rootDir } from './lib/repo-checks.ts'
import { parseMetadataList, validateFixtureMetadata } from './lib/fixture-metadata.ts'

const files = await findFixtureFiles()
const failures: string[] = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const result = validateFixtureMetadata(source)

  for (const failure of result.failures) {
    failures.push(`${relative(rootDir, file)}: ${failure}`)
  }

  if (result.failures.length === 0) {
    await checkFixtureCompile(file, source, result.metadata)
  }
}

if (failures.length > 0) {
  console.error(['Fixture checks failed', ...failures.map(failure => `- ${failure}`)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`Fixture checks passed (${files.length} fixture${files.length === 1 ? '' : 's'})`)
}

async function checkFixtureCompile(file: string, source: string, metadata: Map<string, string>): Promise<void> {
  const rel = relative(rootDir, file)
  const expectation = metadata.get('expect')
  const diagnostic = metadata.get('diagnostic')
  const targets = parseMetadataList(metadata.get('targets') ?? 'js')

  for (const target of targets) {
    try {
      await compileFile(file, {
        target: target as CompileTarget
      })

      if (expectation === 'diagnostic') {
        failures.push(`${rel}: expected diagnostic ${diagnostic} for target ${target}`)
      }
    } catch (error) {
      if (!(error instanceof CompileError)) {
        failures.push(`${rel}: unexpected error for target ${target}: ${error.message}`)
        continue
      }

      if (expectation === 'pass') {
        failures.push(`${rel}: expected pass for target ${target}, got ${error.diagnostics.map(item => item.code).join(', ')}`)
        continue
      }

      if (expectation === 'diagnostic' && !error.diagnostics.some(item => item.code === diagnostic)) {
        failures.push(`${rel}: expected diagnostic ${diagnostic} for target ${target}, got ${error.diagnostics.map(item => item.code).join(', ')}`)
      }
    }
  }
}
