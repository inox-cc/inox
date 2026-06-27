import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const testsRoot = join(repoRoot, 'tests')
const thisFile = fileURLToPath(import.meta.url)

export async function assertTestsDoNotReferenceExamples(): Promise<void> {
  const offenders: string[] = []
  const forbiddenUnixPath = ['examples', ''].join('/')
  const forbiddenWindowsPath = ['examples', ''].join('\\')

  for (const file of await collectTestSources(testsRoot)) {
    if (file === thisFile) {
      continue
    }

    const content = await readFile(file, 'utf8')

    if (content.includes(forbiddenUnixPath) || content.includes(forbiddenWindowsPath)) {
      offenders.push(relative(repoRoot, file))
    }
  }

  assert.deepEqual(offenders, [], `tests must not reference example fixtures:\n${offenders.join('\n')}`)
}

async function collectTestSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectTestSources(path)))
    } else if (entry.isFile() && path.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertTestsDoNotReferenceExamples()
}
