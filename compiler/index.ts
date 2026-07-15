#!/usr/bin/env node

import { join } from 'node:path'
import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { generateCompilerLibraryRegistry } from '../scripts/lib/compiler-library-registry.ts'
import { rootDir } from '../scripts/lib/repo-root.ts'
import { runCompilerCli } from './cli.ts'
import type { CompilerLibraryLiteralTypeInference, CompilerLibrarySet } from './extensions/types.ts'

type GeneratedCompilerLibraryRegistry = {
  defaultCompilerLibrarySet: CompilerLibrarySet
  defaultCompilerLibraryLiteralTypeInference: CompilerLibraryLiteralTypeInference
}

const outputDirectory = join(rootDir, 'dist/compiler-libraries')
await generateCompilerLibraryRegistry(rootDir, outputDirectory)

const registryUrl = pathToFileURL(join(outputDirectory, 'default-registry.ts')).href
const registry = (await import(registryUrl)) as GeneratedCompilerLibraryRegistry

runCompilerCli(
  registry.defaultCompilerLibrarySet,
  {
    args: process.argv,
    cwd: process.cwd(),
    error: (message: string) => console.error(message),
    log: (message: string) => console.log(message),
    mkdirSync: (path: string) => fs.mkdirSync(path, { recursive: true }),
    setExitCode: (code: number) => {
      process.exitCode = code
    },
    writeFileSync: (path: string, source: string) => fs.writeFileSync(path, source)
  },
  registry.defaultCompilerLibraryLiteralTypeInference
)
