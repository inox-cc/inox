#!/usr/bin/env node

import { join, resolve } from 'node:path'
import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { generateCompilerLibraryRegistry } from '../scripts/lib/compiler-library-registry.ts'
import { runHostCommand } from '../scripts/lib/compiler-cli-host.ts'
import { rootDir } from '../scripts/lib/repo-root.ts'
import {
  compilerTargetCMakeOptionMappings,
  nativeCompilerTargetProfile
} from '../scripts/lib/compiler-target-profile.ts'
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
    build: {
      cmakeCommand: 'cmake',
      cmakeOptionMappings: compilerTargetCMakeOptionMappings,
      compilerCommand: [process.execPath, join(rootDir, 'compiler/index.ts')],
      compilerDependencies: [join(rootDir, 'compiler/index.ts')],
      defaultLibraryOptions: nativeCompilerTargetProfile.optionValues,
      executableSuffix: process.platform === 'win32' ? '.exe' : '',
      toolchainRoot: rootDir
    },
    cwd: process.cwd(),
    error: (message: string) => console.error(message),
    log: (message: string) => console.log(message),
    mkdirSync: (path: string) => fs.mkdirSync(path, { recursive: true }),
    resolvePath: (path: string) => resolve(process.cwd(), path),
    runCommand: runHostCommand,
    setExitCode: (code: number) => {
      process.exitCode = code
    },
    writeFileSync: (path: string, source: string) => fs.writeFileSync(path, source)
  },
  registry.defaultCompilerLibraryLiteralTypeInference
)
