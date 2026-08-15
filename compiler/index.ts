#!/usr/bin/env node

import { join, resolve } from 'node:path'
import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { generateCompilerLibraryRegistry } from '../scripts/lib/compiler-library-registry.ts'
import { runHostCommand, runHostProgram } from '../scripts/lib/compiler-cli-host.ts'
import { rootDir } from '../scripts/lib/repo-root.ts'
import { prepareProjectCompilerLibraries } from '../bin/project-libraries.js'
import {
  compilerTargetBuildPreparations,
  compilerTargetCMakeOptionMappings
} from '../scripts/lib/compiler-target-profile.ts'
import { runCompilerCli } from './cli.ts'
import { loadProjectCompilerLibraries } from './extensions/project-libraries.ts'
import { createNodeCompilerSyncPathHost } from './node-host.ts'
import type {
  CompilerLibraryDescriptor,
  CompilerLibraryLiteralTypeInference,
  CompilerLibrarySet,
  LibraryOptionDescriptor
} from './extensions/types.ts'

type GeneratedCompilerLibraryRegistry = {
  defaultCompilerLibraryDescriptors: CompilerLibraryDescriptor[]
  defaultCompilerLibrarySet: CompilerLibrarySet
  defaultCompilerLibraryTargetOptions: LibraryOptionDescriptor[]
  defaultCompilerLibraryLiteralTypeInference: CompilerLibraryLiteralTypeInference
}

const outputDirectory = join(rootDir, 'dist/compiler-libraries')
await generateCompilerLibraryRegistry(rootDir, outputDirectory)

const registryUrl = pathToFileURL(join(outputDirectory, 'default-registry.ts')).href
const registry = (await import(registryUrl)) as GeneratedCompilerLibraryRegistry
const compilerHost = createNodeCompilerSyncPathHost()
const helpRequested = compilerHelpRequested(process.argv.slice(2))
let projectPreparation: ReturnType<typeof prepareProjectCompilerLibraries> | null = null

if (!helpRequested) {
  try {
    projectPreparation = prepareProjectCompilerLibraries({
      cwd: process.cwd(),
      toolchainRoot: rootDir
    })
  } catch (error) {
    console.error(`Cannot prepare Inox project libraries: ${(error as Error).message}`)
    process.exit(1)
  }
}

const projectLibrariesManifest =
  (process.env.INOX_PROJECT_LIBRARIES ?? '').length > 0
    ? (process.env.INOX_PROJECT_LIBRARIES ?? null)
    : (projectPreparation?.packageRootsManifestPath ?? null)
const projectLibraries = helpRequested
  ? { librarySet: registry.defaultCompilerLibrarySet, nativeUnits: [], packageRoots: [] }
  : loadProjectCompilerLibraries(
      registry.defaultCompilerLibrarySet,
      registry.defaultCompilerLibraryDescriptors,
      registry.defaultCompilerLibraryTargetOptions,
      compilerHost,
      projectLibrariesManifest
    )

runCompilerCli(
  projectLibraries.librarySet,
  {
    args: process.argv,
    build: {
      cmakeCommand: 'cmake',
      cmakeOptionMappings: compilerTargetCMakeOptionMappings,
      defaultLibraryOptions: [],
      executableSuffix: process.platform === 'win32' ? '.exe' : '',
      nativePlanPath:
        (process.env.INOX_NATIVE_PLAN ?? '').length > 0
          ? resolve(process.cwd(), process.env.INOX_NATIVE_PLAN ?? '')
          : (projectPreparation?.nativePlanCMakePath ?? ''),
      preparations: compilerTargetBuildPreparations,
      toolchainRoot: rootDir
    },
    cwd: process.cwd(),
    error: (message: string) => console.error(message),
    fileExists: (path: string) => fs.existsSync(path),
    log: (message: string) => console.log(message),
    mkdirSync: (path: string) => fs.mkdirSync(path, { recursive: true }),
    readFileSync: (path: string) => {
      try {
        return fs.readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
    resolvePath: (path: string) => resolve(process.cwd(), path),
    runCommand: runHostCommand,
    runProgram: runHostProgram,
    setExitCode: (code: number) => {
      process.exitCode = code
    },
    writeFileSync: (path: string, source: string) => fs.writeFileSync(path, source)
  },
  registry.defaultCompilerLibraryLiteralTypeInference
)

function compilerHelpRequested(args: string[]): boolean {
  for (let index = 0; index < args.length; index = index + 1) {
    if (args[index] === '--') {
      return false
    }

    if (args[index] === '--help' || args[index] === '-h') {
      return true
    }
  }

  return false
}
