import { lstat, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { rootDir } from './lib/repo-checks.ts'

type CleanOptions = {
  dryRun: boolean
  repoOnly: boolean
}

const repoOutputPaths = [
  'coverage',
  'dist',
  'tmp',
  'example/build',
  'example/build-libuv',
  'example/build-libuv-boringssl'
]
const repoSkipDirs = new Set(['.git', 'node_modules', '.pnpm-store'])
const repoTempFileNames = new Set(['.DS_Store'])
const repoTempFileSuffixes = ['.tmp', '.log']
const systemTempRoots = uniquePaths([tmpdir(), '/private/tmp'])

const parsed = parseArgs(process.argv.slice(2))

if (!parsed.ok) {
  console.error(parsed.error)
  console.error('')
  console.error(usage())
  process.exit(1)
}

if (parsed.help) {
  console.log(usage())
  process.exit(0)
}

const removed = await clean(parsed.options)

if (removed === 0) {
  console.log(parsed.options.dryRun ? 'nothing to remove' : 'clean')
}

async function clean(options: CleanOptions): Promise<number> {
  const targets = new Map<string, string>()

  for (const path of repoOutputPaths) {
    const absolute = resolveRepoPath(path)
    targets.set(absolute, path)
  }

  for (const file of await collectRepoTempFiles(rootDir)) {
    targets.set(file, relative(rootDir, file))
  }

  if (!options.repoOnly) {
    for (const tempRoot of systemTempRoots) {
      for (const path of await collectSystemTempPaths(tempRoot)) {
        targets.set(path, path)
      }
    }
  }

  let count = 0

  for (const [path, label] of [...targets.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    if (!(await exists(path))) {
      continue
    }

    count += 1

    if (options.dryRun) {
      console.log(`would remove ${label}`)
    } else {
      await rm(path, {
        recursive: true,
        force: true
      })
      console.log(`removed ${label}`)
    }
  }

  return count
}

async function collectRepoTempFiles(dir: string): Promise<string[]> {
  let entries

  try {
    entries = await readdir(dir, {
      withFileTypes: true
    })
  } catch {
    return []
  }

  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (!repoSkipDirs.has(entry.name)) {
        files.push(...(await collectRepoTempFiles(path)))
      }
    } else if (entry.isFile() && isRepoTempFile(entry.name)) {
      files.push(path)
    }
  }

  return files
}

async function collectSystemTempPaths(root: string): Promise<string[]> {
  let entries

  try {
    entries = await readdir(root, {
      withFileTypes: true
    })
  } catch {
    return []
  }

  return entries.filter((entry) => entry.name.startsWith('ccjs-')).map((entry) => join(root, entry.name))
}

function isRepoTempFile(name: string): boolean {
  return repoTempFileNames.has(name) || repoTempFileSuffixes.some((suffix) => name.endsWith(suffix))
}

function resolveRepoPath(path: string): string {
  const resolved = resolve(rootDir, path)
  const root = rootDir.endsWith(sep) ? rootDir : `${rootDir}${sep}`

  if (resolved !== rootDir && !resolved.startsWith(root)) {
    throw new Error(`refusing to clean path outside repo: ${path}`)
  }

  return resolved
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

function parseArgs(args: string[]):
  | {
      ok: true
      help: boolean
      options: CleanOptions
    }
  | {
      ok: false
      error: string
    } {
  let dryRun = false
  let repoOnly = false

  for (const arg of args) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return {
        ok: true,
        help: true,
        options: {
          dryRun,
          repoOnly
        }
      }
    }

    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true
    } else if (arg === '--repo-only') {
      repoOnly = true
    } else {
      return {
        ok: false,
        error: `unknown option ${arg}`
      }
    }
  }

  return {
    ok: true,
    help: false,
    options: {
      dryRun,
      repoOnly
    }
  }
}

function usage(): string {
  return `Usage:
  pnpm run clean
  pnpm run clean -- --dry-run
  pnpm run clean -- --repo-only

Removes known ccjs build outputs and temporary files:
- repo outputs: ${repoOutputPaths.join(', ')}
- repo temp files: ${[...repoTempFileNames, ...repoTempFileSuffixes.map((suffix) => `*${suffix}`)].join(', ')}
- system temp entries named ccjs-* under ${systemTempRoots.join(', ')}
`
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))]
}
