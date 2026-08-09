import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { discoverCompilerLibraries } from './compiler-library-discovery.ts'
import { rootDir } from './repo-root.ts'

export async function collectStdlibNativeSources(): Promise<string[]> {
  const libraries = await discoverCompilerLibraries()
  const sources = new Set<string>()

  for (const library of libraries) {
    for (const source of library.nativeSources) {
      sources.add(source)
    }
  }

  return Array.from(sources).sort()
}

export async function collectStdlibNativeHeaders(): Promise<string[]> {
  const libraries = await discoverCompilerLibraries()
  const headers = new Set<string>()

  for (const library of libraries) {
    for (const includeDir of library.nativeIncludeDirs) {
      for (const header of await collectHeaderFiles(join(rootDir, includeDir))) {
        headers.add(repoRelativePath(header))
      }
    }
  }

  return Array.from(headers).sort()
}

export async function collectStdlibNativeIncludeArgs(): Promise<string[]> {
  const libraries = await discoverCompilerLibraries()
  const includeDirs = new Set<string>()

  for (const library of libraries) {
    for (const includeDir of library.nativeIncludeDirs) {
      includeDirs.add(includeDir)
    }
  }

  return Array.from(includeDirs)
    .sort()
    .map((directory) => `-I${directory}`)
}

export async function collectStdlibNativeLinkerArguments(): Promise<string[]> {
  const libraries = await discoverCompilerLibraries()
  const argumentsSet = new Set<string>()

  for (const library of libraries) {
    for (const argument of library.nativeBuild?.linkerArguments ?? []) {
      argumentsSet.add(argument)
    }
  }

  return Array.from(argumentsSet)
}

async function collectHeaderFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const headers: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      headers.push(...(await collectHeaderFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.h')) {
      headers.push(path)
    }
  }

  return headers
}

function repoRelativePath(path: string): string {
  return relative(rootDir, path).split(sep).join('/')
}
