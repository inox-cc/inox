import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { rootDir } from './repo-checks.ts'

export type SnapshotSource = {
  path: string
  rel: string
  source: string
}

export type SnapshotOutput = {
  path: string
  content: string
}

export type SnapshotSuiteOptions = {
  title: string
  root: string
  sourceSuffix: string
  update: boolean
  updateCommand: string
  createOutputs: (source: SnapshotSource) => Promise<SnapshotOutput[]> | SnapshotOutput[]
}

type NodeError = Error & {
  code?: string
}

export async function runSnapshotSuite(options: SnapshotSuiteOptions): Promise<void> {
  const files = await findSnapshotSources(options.root, options.sourceSuffix)
  const failures: string[] = []
  let outputCount = 0

  if (files.length === 0) {
    failures.push(`missing snapshot sources under ${relative(rootDir, options.root)}`)
  }

  for (const file of files) {
    const rel = relative(rootDir, file)
    const source = await readFile(file, 'utf8')
    const outputs = await options.createOutputs({
      path: file,
      rel,
      source
    })

    outputCount += outputs.length

    for (const output of outputs) {
      await checkSnapshotOutput(rel, output, options, failures)
    }
  }

  if (failures.length > 0) {
    console.error([`${options.title} failed`, ...failures.map((failure) => `- ${failure}`)].join('\n'))
    process.exitCode = 1
  } else {
    const action = options.update ? 'updated' : 'passed'

    console.log(
      `${options.title} ${action} (${formatCount(files.length, 'source')}, ${formatCount(outputCount, 'snapshot')})`
    )
  }
}

async function checkSnapshotOutput(
  sourceRel: string,
  output: SnapshotOutput,
  options: SnapshotSuiteOptions,
  failures: string[]
): Promise<void> {
  if (options.update) {
    await mkdir(dirname(output.path), {
      recursive: true
    })
    await writeFile(output.path, output.content)
    return
  }

  try {
    const expected = await readFile(output.path, 'utf8')

    if (expected !== output.content) {
      failures.push(
        `${sourceRel}: snapshot mismatch at ${relative(rootDir, output.path)}; run ${options.updateCommand}`
      )
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      failures.push(`${sourceRel}: missing ${relative(rootDir, output.path)}; run ${options.updateCommand}`)
      return
    }

    throw error
  }
}

async function findSnapshotSources(dir: string, sourceSuffix: string): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await findSnapshotSources(path, sourceSuffix)))
    } else if (entry.isFile() && entry.name.endsWith(sourceSuffix)) {
      files.push(path)
    }
  }

  return files.sort()
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`
}

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && 'code' in error
}
