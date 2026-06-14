#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CompileError, formatDiagnostics } from '../src/compiler/diagnostics.ts'
import { compileFile, compileFileToCModules } from '../src/compiler/index.ts'
import type {
  CompileOptions,
  RandomOptions,
  RuntimeBudgets,
  RuntimeCapabilities,
  RuntimeProfile
} from '../src/compiler/types.ts'
import { defaultEmitOutput, parseCliArgs, usage } from '../scripts/lib/cli-args.ts'
import type { CliPlan } from '../scripts/lib/cli-args.ts'

type CConfig = {
  budgets?: RuntimeBudgets
  capabilities?: RuntimeCapabilities
  c?: {
    cc?: string
    cflags?: string | string[]
    ldflags?: string | string[]
  }
  profile?: RuntimeProfile
  random?: RandomOptions
}

type CompileCOptions = {
  source?: string
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cRuntimeSourceGroups = {
  async: ['runtime/c/src/async/loop.c', 'runtime/c/src/async/promise.c'],
  binary: ['runtime/c/src/binary/binary.c'],
  console: ['runtime/c/src/console/console.c'],
  fs: ['runtime/c/src/fs/fs.c'],
  json: ['runtime/c/src/json/json.c'],
  managed: [
    'runtime/c/src/core/value.c',
    'runtime/c/src/core/allocator.c',
    'runtime/c/src/core/callback.c',
    'runtime/c/src/strings/string.c',
    'runtime/c/src/objects/object.c',
    'runtime/c/src/arrays/array.c',
    'runtime/c/src/collections/map.c',
    'runtime/c/src/collections/set.c'
  ],
  time: ['runtime/c/src/time/time.c']
}
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
    process.exitCode = await spawnAndWait('pnpm', ['run', 'check'])
  } else if (plan.command === 'run') {
    await runEntry(plan)
  } else if (plan.command === 'emit' && plan.emit != null) {
    await writeCompiledSource(plan)
  } else if (plan.command === 'build') {
    if (plan.target === 'c') {
      await buildCExecutable(plan)
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
  await runCEntry(plan)
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

async function writeCompiledSource(plan: CliPlan): Promise<void> {
  const entry = requireEntry(plan)
  const config = await loadConfig()

  if (plan.outDir != null && plan.entryMode) {
    const result = await compileFileToCModules(entry, {
      target: 'c',
      callMain: false,
      sourceRoot: process.cwd(),
      ...cCompileOptions(config)
    })

    for (const file of result.files) {
      const out = join(plan.outDir, file.path)
      const dir = dirname(out)

      if (dir !== '.') {
        await mkdir(dir, {
          recursive: true
        })
      }

      await writeFile(out, file.code)
    }

    console.log(plan.outDir)
    return
  }

  const result = await compileFile(entry, {
    target: 'c',
    callMain: false,
    ...cCompileOptions(config)
  })
  const out = plan.out ?? defaultEmitOutput(entry, 'c')
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
    callMain: false,
    ...cCompileOptions(config)
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
    const runtimeSources = cRuntimeSourcesForCode(result.code)

    return await spawnAndWait(compiler.command, [
      ...compiler.args,
      ...configCFlags(config),
      ...splitCommandWords(process.env.CFLAGS),
      `-I${join(repoRoot, 'runtime/c/include')}`,
      source,
      ...runtimeSources,
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

function cRuntimeSourcesForCode(code: string): string[] {
  const groups = new Set<keyof typeof cRuntimeSourceGroups>()

  if (usesCHeader(code, 'time')) {
    groups.add('time')
  }

  if (usesCHeader(code, 'binary')) {
    groups.add('managed')
    groups.add('binary')
  }

  if (usesCHeader(code, 'console')) {
    groups.add('console')
  }

  if (usesCHeader(code, 'loop') || usesCHeader(code, 'promise')) {
    groups.add('managed')
    groups.add('async')
  }

  if (usesCHeader(code, 'fs')) {
    groups.add('managed')
    groups.add('async')
    groups.add('binary')
    groups.add('fs')
  }

  if (usesCHeader(code, 'json')) {
    groups.add('managed')
    groups.add('json')
  }

  if (
    usesCHeader(code, 'array') ||
    usesCHeader(code, 'callback') ||
    usesCHeader(code, 'map') ||
    usesCHeader(code, 'object') ||
    usesCHeader(code, 'set') ||
    usesCHeader(code, 'string') ||
    usesCHeader(code, 'value')
  ) {
    groups.add('managed')
  }

  return Object.entries(cRuntimeSourceGroups)
    .filter(([group]) => groups.has(group as keyof typeof cRuntimeSourceGroups))
    .flatMap(([, sources]) => sources)
    .map((file) => join(repoRoot, file))
}

function usesCHeader(code: string, name: string): boolean {
  return code.includes(`#include "ccjs/${name}.h"`)
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
        throw new Error(`invalid ${fileName}: ${error.message}`, {
          cause: error
        })
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

  validateProfileConfig(value.profile, fileName)
  validateBudgetsConfig(value.budgets, fileName)
  validateCapabilitiesConfig(value.capabilities, fileName)
  validateRandomConfig(value.random, fileName)

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

function cCompileOptions(config: CConfig): Pick<CompileOptions, 'budgets' | 'capabilities' | 'profile' | 'random'> {
  return {
    budgets: config.budgets,
    capabilities: config.capabilities,
    profile: config.profile,
    random: config.random
  }
}

function validateProfileConfig(value: unknown, fileName: string): void {
  if (value == null) {
    return
  }

  if (value !== 'hosted' && value !== 'embedded') {
    throw new Error(`invalid ${fileName}: profile must be "hosted" or "embedded"`)
  }
}

function validateBudgetsConfig(value: unknown, fileName: string): void {
  if (value == null) {
    return
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ${fileName}: budgets must be an object`)
  }

  const budgets = value as RuntimeBudgets
  const allowed = new Set(['maxFeatures', 'maxRuntimeRequirements'])

  for (const [key, budget] of Object.entries(budgets)) {
    if (!allowed.has(key)) {
      throw new Error(`invalid ${fileName}: unknown budget ${JSON.stringify(key)}`)
    }

    if (!Number.isInteger(budget) || budget < 0) {
      throw new Error(`invalid ${fileName}: budget ${key} must be a non-negative integer`)
    }
  }
}

function validateCapabilitiesConfig(value: unknown, fileName: string): void {
  if (value == null) {
    return
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ${fileName}: capabilities must be an object`)
  }

  const capabilities = value as RuntimeCapabilities
  const allowed = new Set(['entropy', 'fs', 'heap', 'monotonicClock', 'timers', 'wallClock'])

  for (const [key, enabled] of Object.entries(capabilities)) {
    if (!allowed.has(key)) {
      throw new Error(`invalid ${fileName}: unknown capability ${JSON.stringify(key)}`)
    }

    if (typeof enabled !== 'boolean') {
      throw new Error(`invalid ${fileName}: capability ${key} must be boolean`)
    }
  }
}

function validateRandomConfig(value: unknown, fileName: string): void {
  const invalidConfig = (message: string): Error => new Error(`invalid ${fileName}: ${message}`)

  if (value == null) {
    return
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw invalidConfig('random must be an object')
  }

  const random = value as CConfig['random']

  if (random?.backend != null && !['simple', 'xorshift32', 'os'].includes(random.backend)) {
    throw invalidConfig('random.backend must be "simple", "xorshift32" or "os"')
  }

  if (random?.seed != null && (!Number.isInteger(random.seed) || random.seed < 0 || random.seed > 0xffffffff)) {
    throw invalidConfig('random.seed must be an integer from 0 to 4294967295')
  }
}

function validateConfigFlags(value: unknown, path: string, fileName: string): void {
  if (value == null || typeof value === 'string') {
    return
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`invalid ${fileName}: ${path} must be a string or an array of strings`)
  }
}

function cCompilerCommand(config: CConfig): { command: string; args: string[] } {
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
    child.on('exit', (code) => {
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
