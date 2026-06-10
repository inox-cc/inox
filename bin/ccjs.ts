#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CompileError, formatDiagnostics } from '../src/compiler/diagnostics.ts'
import { compileFile } from '../src/compiler/index.ts'
import { defaultEmitOutput, parseCliArgs, usage } from '../scripts/lib/cli-args.ts'
import type { CliPlan, CliTarget } from '../scripts/lib/cli-args.ts'

type CConfig = {
  c?: {
    cc?: string
    cflags?: string | string[]
    ldflags?: string | string[]
  }
}

type CompileCOptions = {
  source?: string
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cRuntimeSources = [
  'runtime/c/src/core/value.c',
  'runtime/c/src/core/allocator.c',
  'runtime/c/src/core/callback.c',
  'runtime/c/src/async/loop.c',
  'runtime/c/src/async/promise.c',
  'runtime/c/src/strings/string.c',
  'runtime/c/src/objects/object.c',
  'runtime/c/src/arrays/array.c',
  'runtime/c/src/collections/map.c',
  'runtime/c/src/collections/set.c',
  'runtime/c/src/fs/fs.c',
  'runtime/c/src/time/time.c'
].map(file => join(repoRoot, file))
const configFileNames = ['ccjs.config.json', 'ccjs.json']

const result = parseCliArgs(process.argv.slice(2))

if (!result.ok) {
  console.error(result.error)
  console.error('')
  console.error(usage)
  process.exit(1)
}

const plan = result.plan

try {
  if (plan.help) {
    console.log(usage)
  } else if (plan.command === 'test') {
    process.exitCode = await spawnAndWait('npm', ['run', 'check'])
  } else if (plan.command === 'run') {
    await runEntry(plan)
  } else if (plan.command === 'emit' && plan.emit != null) {
    await writeCompiledSource(plan, plan.emit)
  } else if (plan.command === 'build') {
    if (plan.target === 'c') {
      await buildCExecutable(plan)
    } else if (plan.target != null) {
      await writeCompiledSource(plan, plan.target)
    }
  }
} catch (error) {
  if (error instanceof CompileError) {
    console.error(formatDiagnostics(error.diagnostics))
  } else {
    console.error(error.message)
  }

  process.exitCode = 1
}

async function runEntry(plan: CliPlan): Promise<void> {
  const target = plan.target ?? 'ts'
  const entry = requireEntry(plan)

  if (target === 'c') {
    await runCEntry(plan)
    return
  }

  const result = await compileFile(entry, {
    target: 'ts'
  })
  const tempDir = await mkdtemp(join(tmpdir(), 'ccjs-'))
  const file = join(tempDir, 'main.ts')

  await writeFile(join(tempDir, 'package.json'), `${JSON.stringify({
    type: 'module'
  }, null, 2)}\n`)
  await writeFile(file, result.code)

  try {
    process.exitCode = await spawnAndWait(process.execPath, [file])
  } finally {
    if (plan.keep) {
      console.error(`kept ${tempDir}`)
    } else {
      await rm(tempDir, {
        recursive: true,
        force: true
      })
    }
  }
}

async function runCEntry(plan: CliPlan): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'ccjs-c-run-'))
  const source = join(tempDir, 'main.c')
  const output = join(tempDir, 'main')

  try {
    const buildCode = await compileCExecutable(requireEntry(plan), output, {
      source
    })

    if (buildCode !== 0) {
      process.exitCode = buildCode
      return
    }

    process.exitCode = await spawnAndWait(output, [])
  } finally {
    if (plan.keep) {
      console.error(`kept ${tempDir}`)
    } else {
      await rm(tempDir, {
        recursive: true,
        force: true
      })
    }
  }
}

async function writeCompiledSource(plan: CliPlan, target: CliTarget): Promise<void> {
  const entry = requireEntry(plan)
  const result = await compileFile(entry, {
    target,
    callMain: false
  })
  const out = plan.out ?? defaultEmitOutput(entry, target)
  const dir = dirname(out)

  if (dir !== '.') {
    await mkdir(dir, {
      recursive: true
    })
  }

  await writeFile(out, result.code)
  console.log(out)
}

async function buildCExecutable(plan: CliPlan): Promise<void> {
  const entry = requireEntry(plan)
  const out = plan.out ?? defaultCBuildOutput(entry)
  const code = await compileCExecutable(entry, out)

  if (code !== 0) {
    process.exitCode = code
    return
  }

  console.log(out)
}

async function compileCExecutable(entry: string, out: string, options: CompileCOptions = {}): Promise<number> {
  const config = await loadConfig()
  const result = await compileFile(entry, {
    target: 'c',
    callMain: false
  })
  const dir = dirname(out)
  const tempDir = options.source == null ? await mkdtemp(join(tmpdir(), 'ccjs-c-build-')) : null
  const source = options.source ?? join(tempDir as string, 'main.c')

  if (dir !== '.') {
    await mkdir(dir, {
      recursive: true
    })
  }

  await writeFile(source, result.code)

  try {
    const compiler = cCompilerCommand(config)

    return await spawnAndWait(compiler.command, [
      ...compiler.args,
      ...configCFlags(config),
      ...splitCommandWords(process.env.CFLAGS),
      `-I${join(repoRoot, 'runtime/c/include')}`,
      source,
      ...cRuntimeSources,
      ...configLdFlags(config),
      ...splitCommandWords(process.env.LDFLAGS),
      '-o',
      out
    ])
  } finally {
    if (tempDir != null) {
      await rm(tempDir, {
        recursive: true,
        force: true
      })
    }
  }
}

async function loadConfig(): Promise<CConfig> {
  for (const fileName of configFileNames) {
    try {
      const text = await readFile(fileName, 'utf8')
      return validateConfig(JSON.parse(text), fileName)
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue
      }

      if (error instanceof SyntaxError) {
        throw new Error(`invalid ${fileName}: ${error.message}`)
      }

      throw error
    }
  }

  return {}
}

function validateConfig(config: unknown, fileName: string): CConfig {
  const invalidConfig = (message: string): Error => new Error(`invalid ${fileName}: ${message}`)

  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    throw invalidConfig('root value must be an object')
  }

  const value = config as CConfig

  if (value.c == null) {
    return value
  }

  if (typeof value.c !== 'object' || Array.isArray(value.c)) {
    throw invalidConfig('c must be an object')
  }

  if (value.c.cc != null && typeof value.c.cc !== 'string') {
    throw invalidConfig('c.cc must be a string')
  }

  validateConfigFlags(value.c.cflags, 'c.cflags', fileName)
  validateConfigFlags(value.c.ldflags, 'c.ldflags', fileName)

  return value
}

function validateConfigFlags(value: unknown, path: string, fileName: string): void {
  if (value == null || typeof value === 'string') {
    return
  }

  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`invalid ${fileName}: ${path} must be a string or an array of strings`)
  }
}

function cCompilerCommand(config: CConfig): { command: string, args: string[] } {
  const envValue = process.env.CC?.trim()
  const configValue = typeof config?.c?.cc === 'string' ? config.c.cc.trim() : ''
  const value = envValue == null || envValue === '' ? configValue : envValue

  if (value == null || value === '') {
    return {
      command: 'cc',
      args: []
    }
  }

  const [command, ...args] = splitCommandWords(value)

  return {
    command,
    args
  }
}

function configCFlags(config: CConfig): string[] {
  return configFlags(config?.c?.cflags)
}

function configLdFlags(config: CConfig): string[] {
  return configFlags(config?.c?.ldflags)
}

function configFlags(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    return splitCommandWords(value)
  }

  return []
}

function splitCommandWords(value: string | undefined): string[] {
  const trimmed = value?.trim()

  if (trimmed == null || trimmed === '') {
    return []
  }

  const words: string[] = []
  let current = ''
  let quote: string | null = null
  let escaping = false
  let hasQuotedPart = false

  for (const char of trimmed) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }

    if (quote != null) {
      if (char === quote) {
        quote = null
        hasQuotedPart = true
      } else {
        current += char
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      hasQuotedPart = true
    } else if (/\s/.test(char)) {
      if (current !== '' || hasQuotedPart) {
        words.push(current)
        current = ''
        hasQuotedPart = false
      }
    } else {
      current += char
    }
  }

  if (escaping) {
    current += '\\'
  }

  if (quote != null) {
    throw new Error(`unterminated quote in command flags: ${trimmed}`)
  }

  if (current !== '' || hasQuotedPart) {
    words.push(current)
  }

  return words
}

function defaultCBuildOutput(entry: string): string {
  const ext = entry.endsWith('.ts') ? '.ts' : entry.endsWith('.js') ? '.js' : ''
  const base = ext === '' ? entry : entry.slice(0, -ext.length)

  return base
}

function spawnAndWait(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit'
    })

    child.on('error', reject)
    child.on('exit', code => {
      resolve(code ?? 1)
    })
  })
}

function requireEntry(plan: CliPlan): string {
  if (plan.entry == null) {
    throw new Error(`${plan.command} requires an entry file`)
  }

  return plan.entry
}
