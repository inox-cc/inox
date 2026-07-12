#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { compileFileSync, compileFileToCModuleTextsSync } from './compiler.ts'
import type { CModuleCompileOptions } from './core.ts'
import { formatDiagnostics } from './diagnostics.ts'
import type { CompilerLibrarySet } from './extensions/types.ts'
import type { CompileOptions, Diagnostic, RuntimeLoopBackend, TlsBackend } from './types.ts'

type DiagnosticError = {
  diagnostics: Diagnostic[]
}

type MessageError = {
  message: string | null | undefined
}

export type CliArguments = string[]

type CliPlan = {
  emitCc: boolean
  entryMode: boolean
  hasOutDir: boolean
  hasOutput: boolean
  input: string
  loopBackend: RuntimeLoopBackend | null
  outDir: string
  output: string
  tlsBackend: TlsBackend | null
}

type CliParseResult =
  | {
      ok: true
      help: boolean
      plan: CliPlan | null
    }
  | {
      ok: false
      error: string
    }

function defaultOutputPath(input: string): string {
  const slash = input.lastIndexOf('/')
  const backslash = input.lastIndexOf('\\')
  const separator = slash > backslash ? slash : backslash
  const dot = input.lastIndexOf('.')

  if (dot > separator) {
    return input.slice(0, dot) + '.cc'
  }

  return input + '.cc'
}

function usage(): string {
  return 'Usage:\n  inox --help\n  inox input.ts [output.cc]\n  inox input.ts --emit cc [-o output.cc] [--loop-backend embedded|libuv] [--tls-backend none|boringssl|openssl]\n  inox input.ts --emit cc --out-dir generated --entry [--loop-backend embedded|libuv] [--tls-backend none|boringssl|openssl]\n\nCompiles a TypeScript entry file to C++ source.\nIf output.cc is omitted, inox writes input.cc.'
}

function isHelpArgument(value: string): boolean {
  return value === '--help' || value === '-h'
}

function parseCliArgs(args: string[]): CliParseResult {
  if (args.length === 0) {
    return failCliParse('missing input file')
  }

  for (let index = 0; index < args.length; index = index + 1) {
    if (isHelpArgument(args[index])) {
      return {
        ok: true,
        help: true,
        plan: null
      }
    }
  }

  let emitCc = false
  let entryMode = false
  let hasOutDir = false
  let hasOutput = false
  let input: string | null = null
  let loopBackend: RuntimeLoopBackend | null = null
  let outDir = ''
  let output = ''
  let tlsBackend: TlsBackend | null = null

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]

    if (arg === '--emit') {
      const value = args[index + 1]
      index = index + 1

      if (value !== 'cc') {
        return failCliParse('--emit expects cc')
      }

      emitCc = true
    } else if (arg === '-o' || arg === '--out') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse(`${arg} expects a path`)
      }

      if (hasOutput) {
        return failCliParse('output path was specified more than once')
      }

      hasOutput = true
      output = value
    } else if (arg === '--out-dir') {
      const value = args[index + 1]
      index = index + 1

      if (value === null || typeof value === 'undefined' || value.length === 0 || value.startsWith('-')) {
        return failCliParse('--out-dir expects a path')
      }

      hasOutDir = true
      outDir = value
    } else if (arg === '--entry') {
      entryMode = true
    } else if (arg === '--loop-backend') {
      const value = args[index + 1]
      index = index + 1

      if (value !== 'embedded' && value !== 'libuv') {
        return failCliParse('--loop-backend expects embedded or libuv')
      }

      loopBackend = value
    } else if (arg === '--tls-backend') {
      const value = args[index + 1]
      index = index + 1

      if (value !== 'none' && value !== 'boringssl' && value !== 'openssl') {
        return failCliParse('--tls-backend expects none, boringssl or openssl')
      }

      tlsBackend = value
    } else if (arg.startsWith('-')) {
      return failCliParse(`unknown option ${arg}`)
    } else if (input === null) {
      input = arg
    } else if (!hasOutput && !emitCc && !hasOutDir) {
      hasOutput = true
      output = arg
    } else {
      return failCliParse(`unexpected argument ${arg}`)
    }
  }

  if (input === null) {
    return failCliParse('missing input file')
  }

  if (hasOutDir && !emitCc) {
    return failCliParse('--out-dir requires --emit cc')
  }

  if (hasOutDir && !entryMode) {
    return failCliParse('--out-dir requires --entry')
  }

  if (entryMode && !hasOutDir) {
    return failCliParse('--entry requires --out-dir')
  }

  if (hasOutDir && hasOutput) {
    return failCliParse('use either -o/--out or --out-dir')
  }

  return {
    ok: true,
    help: false,
    plan: {
      emitCc,
      entryMode,
      hasOutDir,
      hasOutput,
      input,
      loopBackend,
      outDir,
      output,
      tlsBackend
    }
  }
}

function failCliParse(error: string): CliParseResult {
  return {
    ok: false,
    error
  }
}

function outputDir(plan: CliPlan): string {
  if (plan.hasOutDir) {
    return plan.outDir
  }

  return ''
}

function compileOptions(plan: CliPlan, libraries: CompilerLibrarySet): CompileOptions {
  const options: CompileOptions = {
    target: 'cc',
    libraries
  }

  if (plan.loopBackend !== null) {
    options.loopBackend = plan.loopBackend
  }

  if (plan.tlsBackend !== null) {
    options.tlsBackend = plan.tlsBackend
  }

  return options
}

function cModuleCompileOptions(plan: CliPlan, libraries: CompilerLibrarySet): CModuleCompileOptions {
  const options: CModuleCompileOptions = {
    target: 'cc',
    callMain: plan.entryMode,
    libraries,
    sourceRoot: process.cwd()
  }

  if (plan.loopBackend !== null) {
    options.loopBackend = plan.loopBackend
  }

  if (plan.tlsBackend !== null) {
    options.tlsBackend = plan.tlsBackend
  }

  return options
}

function writeBundledC(plan: CliPlan, libraries: CompilerLibrarySet): void {
  const output = plan.hasOutput ? plan.output : defaultOutputPath(plan.input)
  const result = compileFileSync(plan.input, compileOptions(plan, libraries))

  ensureParentDirectory(output)
  fs.writeFileSync(output, `${result.code}\n`)
  console.log(output)
}

function writeCModules(plan: CliPlan, libraries: CompilerLibrarySet): void {
  const outDir = outputDir(plan)
  const files = compileFileToCModuleTextsSync(plan.input, cModuleCompileOptions(plan, libraries))

  for (let index = 0; index < files.length; index = index + 1) {
    const file = files[index]
    const output = joinPath(outDir, file.path)

    ensureParentDirectory(output)
    fs.writeFileSync(output, file.code)
  }

  console.log(outDir)
}

function ensureParentDirectory(path: string): void {
  const dir = pathDirname(path)

  if (dir === '' || dir === '.') {
    return
  }

  fs.mkdirSync(dir, {
    recursive: true
  })
}

function pathDirname(path: string): string {
  const slash = path.lastIndexOf('/')
  const backslash = path.lastIndexOf('\\')
  const separator = slash > backslash ? slash : backslash

  if (separator < 0) {
    return '.'
  }

  if (separator === 0) {
    return path.slice(0, 1)
  }

  return path.slice(0, separator)
}

function joinPath(left: string, right: string): string {
  if (left === '') {
    return right
  }

  if (right === '') {
    return left
  }

  if (left.endsWith('/') || left.endsWith('\\')) {
    return left + right
  }

  return `${left}/${right}`
}

function userArgs(processArgs: CliArguments): string[] {
  const args: string[] = []

  for (let index = 2; index < processArgs.length; index = index + 1) {
    args.push(processArgs[index])
  }

  return args
}

function errorDiagnostics(error: unknown): Diagnostic[] | null {
  if (error === null || typeof error === 'undefined' || typeof error !== 'object') {
    return null
  }

  const diagnostics = (error as DiagnosticError).diagnostics

  if (Array.isArray(diagnostics)) {
    return diagnostics
  }

  return null
}

function errorMessage(error: unknown): string | null {
  if (error === null || typeof error === 'undefined' || typeof error !== 'object') {
    return null
  }

  const message = (error as MessageError).message ?? ''

  if (message.length > 0) {
    return message
  }

  return null
}

export function runCompilerCli(libraries: CompilerLibrarySet, processArgs: CliArguments): void {
  try {
    const parsed = parseCliArgs(userArgs(processArgs))

    if (!parsed.ok) {
      console.error(parsed.error)
      console.error('')
      console.error(usage())
      process.exitCode = 1
    } else if (parsed.help) {
      console.log(usage())
    } else if (parsed.plan !== null && parsed.plan.hasOutDir) {
      writeCModules(parsed.plan, libraries)
    } else if (parsed.plan !== null) {
      writeBundledC(parsed.plan, libraries)
    }
  } catch (error) {
    const diagnostics = errorDiagnostics(error)

    if (diagnostics !== null && typeof diagnostics !== 'undefined') {
      console.error(formatDiagnostics(diagnostics))
    } else {
      const message = errorMessage(error)

      if (message !== null) {
        console.error(message)
      } else {
        console.error('INOX BUILD ERROR')
      }
    }
    process.exitCode = 1
  }
}
