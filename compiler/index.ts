#!/usr/bin/env node

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { generateCompilerLibraryRegistry } from '../scripts/lib/compiler-library-registry.ts'
import { rootDir } from '../scripts/lib/repo-root.ts'
import { runCompilerCli } from './cli.ts'
import type { CompilerLibrarySet } from './extensions/types.ts'

type GeneratedCompilerLibraryRegistry = {
  defaultCompilerLibrarySet: CompilerLibrarySet
}

const outputDirectory = join(rootDir, 'dist/compiler-libraries')
await generateCompilerLibraryRegistry(rootDir, outputDirectory)

const registryUrl = pathToFileURL(join(outputDirectory, 'default-registry.ts')).href
const registry = (await import(registryUrl)) as GeneratedCompilerLibraryRegistry

runCompilerCli(registry.defaultCompilerLibrarySet, process.argv)
