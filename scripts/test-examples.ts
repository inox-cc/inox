import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parseFixtureMetadata, parseMetadataList, validateFixtureMetadata } from './lib/fixture-metadata.ts'
import { normalizeNewlines, runCommand } from './lib/run-command.ts'
import { rootDir } from './lib/repo-checks.ts'

const examplesDir = join(rootDir, 'examples')
const files = (await readdir(examplesDir))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => join(examplesDir, file))
  .sort()
const failures: string[] = []
let stdoutChecks = 0

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const validation = validateFixtureMetadata(source)
  const rel = relative(rootDir, file)

  for (const failure of validation.failures) {
    failures.push(`${rel}: ${failure}`)
  }

  if (validation.failures.length > 0) {
    continue
  }

  const { metadata } = parseFixtureMetadata(source)
  await checkExample(file, rel, metadata)
}

if (failures.length > 0) {
  console.error(['Example checks failed', ...failures.map((failure) => `- ${failure}`)].join('\n'))
  process.exitCode = 1
} else {
  console.log(
    `Example checks passed (${files.length} example${files.length === 1 ? '' : 's'}, ${stdoutChecks} stdout check${stdoutChecks === 1 ? '' : 's'})`
  )
}

async function checkExample(file: string, rel: string, metadata: Map<string, string>): Promise<void> {
  const expectation = metadata.get('expect')
  const targets = parseMetadataList(metadata.get('targets') ?? 'c')

  if (expectation !== 'pass') {
    failures.push(`${rel}: examples must use @expect pass`)
    return
  }

  if (!metadata.has('stdout')) {
    failures.push(`${rel}: examples must include @stdout`)
    return
  }

  for (const target of targets) {
    const result = await runCommand(process.execPath, ['bin/ccjs.ts', 'run', file, '--target', target])
    const expectedStdout = `${metadata.get('stdout') ?? ''}\n`
    const stdout = normalizeNewlines(result.stdout)

    if (result.code !== 0) {
      failures.push(`${rel}: expected target ${target} to exit 0, got ${result.code}: ${result.stderr.trim()}`)
      continue
    }

    if (stdout !== expectedStdout) {
      failures.push(
        `${rel}: expected stdout ${JSON.stringify(expectedStdout)} for target ${target}, got ${JSON.stringify(stdout)}`
      )
      continue
    }

    stdoutChecks += 1
  }
}
