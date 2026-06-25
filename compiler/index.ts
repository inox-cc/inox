import fs from 'node:fs'
import process from 'node:process'
import { compileFileSync } from './compiler.ts'
import { formatDiagnostics } from './diagnostics.ts'
import type { Diagnostic } from './types.ts'

type DiagnosticError = {
  diagnostics: Diagnostic[]
}

function defaultOutputPath(input: string): string {
  const slash = input.lastIndexOf('/')
  const backslash = input.lastIndexOf('\\')
  const separator = slash > backslash ? slash : backslash
  const dot = input.lastIndexOf('.')

  if (dot > separator) {
    return input.slice(0, dot) + '.c'
  }

  return input + '.c'
}

function usage(): string {
  return 'Usage:\n  inox --help\n  inox input.ts [output.c]\n\nCompiles a TypeScript entry file to C source.\nIf output.c is omitted, inox writes input.c.'
}

function isHelpArgument(value: string): boolean {
  return value === '--help' || value === '-h'
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

try {
  if (process.argv.length < 3) {
    console.error(usage())
    process.exitCode = 1
  } else if (isHelpArgument(process.argv[2])) {
    console.log(usage())
  } else {
    const input = process.argv[2]
    let output = defaultOutputPath(input)

    if (process.argv.length > 3) {
      output = process.argv[3]
    }

    const result = compileFileSync(input, { target: 'c' })

    fs.writeFileSync(output, `${result.code}\n`)
    console.log(output)
  }
} catch (error) {
  const diagnostics = errorDiagnostics(error)

  if (diagnostics !== null && typeof diagnostics !== 'undefined') {
    console.error(formatDiagnostics(diagnostics))
  } else {
    console.error('INOX BUILD ERROR')
  }
  process.exitCode = 1
}
