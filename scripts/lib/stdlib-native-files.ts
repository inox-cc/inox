import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { rootDir } from './repo-root.ts'

const stdlibNodeRoot = join(rootDir, 'stdlib/node')
const stdlibGlobalRoot = join(rootDir, 'stdlib/global')
const stdlibNativeRoots = [stdlibGlobalRoot, stdlibNodeRoot]

export async function collectStdlibNativeSources(): Promise<string[]> {
  const sources = await collectNativeSourceFilesFromRoots(stdlibNativeRoots)

  return sources.map(repoRelativePath).sort()
}

export async function collectStdlibNativeIncludeArgs(): Promise<string[]> {
  const includeDirs = await collectNativeIncludeDirsFromRoots(stdlibNativeRoots)

  return includeDirs.map((directory) => `-I${repoRelativePath(directory)}`).sort()
}

async function collectNativeSourceFilesFromRoots(roots: string[]): Promise<string[]> {
  const files: string[] = []

  for (let index = 0; index < roots.length; index = index + 1) {
    files.push(...(await collectNativeSourceFiles(roots[index])))
  }

  return files
}

async function collectNativeIncludeDirsFromRoots(roots: string[]): Promise<string[]> {
  const directories: string[] = []

  for (let index = 0; index < roots.length; index = index + 1) {
    directories.push(...(await collectNativeIncludeDirs(roots[index])))
  }

  return directories
}

async function collectNativeSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (!entry.isDirectory()) {
      continue
    }

    if (entry.name === 'c') {
      files.push(...(await collectCFiles(path)))
      continue
    }

    if (entry.name !== 'include') {
      files.push(...(await collectNativeSourceFiles(path)))
    }
  }

  return files
}

async function collectCFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isFile() && nativeSourceFileName(entry.name)) {
      files.push(join(directory, entry.name))
    }
  }

  return files
}

function nativeSourceFileName(name: string): boolean {
  return name.endsWith('.c') || name.endsWith('.cc')
}

async function collectNativeIncludeDirs(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true
  })
  const directories: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (!entry.isDirectory()) {
      continue
    }

    if (entry.name === 'include') {
      directories.push(path)
      continue
    }

    if (entry.name !== 'c') {
      directories.push(...(await collectNativeIncludeDirs(path)))
    }
  }

  return directories
}

function repoRelativePath(path: string): string {
  return relative(rootDir, path).split(sep).join('/')
}
