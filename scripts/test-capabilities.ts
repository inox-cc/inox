import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileFile } from '../src/compiler/index.ts'
import type { CompileTarget } from '../src/compiler/types.ts'
import { rootDir } from './lib/repo-checks.ts'

type CapabilityExpectation = {
  expect: 'diagnostic' | 'pass'
  diagnostic?: string
}

type CapabilityMatrix = {
  targets: Partial<Record<CompileTarget, CapabilityExpectation>>
}

const fixtureRoot = join(rootDir, 'tests/fixtures/capabilities')
const files = await findMatrixFiles(fixtureRoot)
const failures: string[] = []
let caseCount = 0

if (files.length === 0) {
  failures.push('missing capability matrix files under tests/fixtures/capabilities')
}

for (const file of files) {
  await checkMatrix(file)
}

if (failures.length > 0) {
  console.error(['Capability matrix checks failed', ...failures.map(failure => `- ${failure}`)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`Capability matrix checks passed (${files.length} matrix${files.length === 1 ? '' : 'es'}, ${caseCount} case${caseCount === 1 ? '' : 's'})`)
}

async function checkMatrix(file: string): Promise<void> {
  const rel = relative(rootDir, file)
  const matrix = parseMatrix(await readFile(file, 'utf8'), rel)
  const source = file.replace(/\.matrix\.json$/, '.ts')

  for (const [target, expectation] of Object.entries(matrix.targets)) {
    caseCount += 1
    await checkTarget(source, rel, target as CompileTarget, expectation)
  }
}

async function checkTarget(source: string, matrixRel: string, target: CompileTarget, expectation: CapabilityExpectation): Promise<void> {
  try {
    await compileFile(source, {
      target
    })

    if (expectation.expect === 'diagnostic') {
      failures.push(`${matrixRel}: expected diagnostic ${expectation.diagnostic ?? '<any>'} for target ${target}`)
    }
  } catch (error) {
    if (!(error instanceof CompileError)) {
      failures.push(`${matrixRel}: unexpected error for target ${target}: ${error.message}`)
      return
    }

    if (expectation.expect === 'pass') {
      failures.push(`${matrixRel}: expected pass for target ${target}, got ${error.diagnostics.map(item => item.code).join(', ')}`)
      return
    }

    if (expectation.diagnostic != null && !error.diagnostics.some(item => item.code === expectation.diagnostic)) {
      failures.push(`${matrixRel}: expected diagnostic ${expectation.diagnostic} for target ${target}, got ${error.diagnostics.map(item => item.code).join(', ')}`)
    }
  }
}

function parseMatrix(source: string, rel: string): CapabilityMatrix {
  const value = JSON.parse(source)

  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${rel}: matrix root must be an object`)
  }

  const targets = (value as CapabilityMatrix).targets

  if (targets == null || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new Error(`${rel}: targets must be an object`)
  }

  for (const [target, expectation] of Object.entries(targets)) {
    if (!isCompileTarget(target)) {
      throw new Error(`${rel}: unknown target ${JSON.stringify(target)}`)
    }

    if (expectation == null || typeof expectation !== 'object' || Array.isArray(expectation)) {
      throw new Error(`${rel}: target ${target} expectation must be an object`)
    }

    if (expectation.expect !== 'pass' && expectation.expect !== 'diagnostic') {
      throw new Error(`${rel}: target ${target} expect must be "pass" or "diagnostic"`)
    }

    if (expectation.expect === 'diagnostic' && typeof expectation.diagnostic !== 'string') {
      throw new Error(`${rel}: target ${target} diagnostic expectation must include diagnostic`)
    }
  }

  return {
    targets
  }
}

function isCompileTarget(value: string): value is CompileTarget {
  return value === 'c' || value === 'js' || value === 'ts'
}

async function findMatrixFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await findMatrixFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.matrix.json')) {
      files.push(path)
    }
  }

  return files.sort()
}
