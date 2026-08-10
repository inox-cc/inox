import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { rootDir } from './repo-root.ts'

export type StdlibTestCategory = 'architecture' | 'integration'

const stdlibRoot = join(rootDir, 'stdlib')

export async function discoverStdlibTestFiles(category: StdlibTestCategory): Promise<string[]> {
  const files = await collectTestFiles(stdlibRoot)
  const categorySegment = `${sep}tests${sep}${category}${sep}`

  return files.filter((file) => `${sep}${relative(stdlibRoot, file)}`.includes(categorySegment)).sort()
}

export async function collectTestFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(path, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(entryPath)))
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(entryPath)
    }
  }

  return files
}
