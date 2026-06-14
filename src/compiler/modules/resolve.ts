import { readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, resolve } from 'node:path'

const sourceExtensions = ['', '.ts', '.js']

export async function resolveExistingSource(path: string): Promise<string> {
  const normalized = normalize(isAbsolute(path) ? path : resolve(path))
  const candidates =
    extname(normalized) === ''
      ? [
          ...sourceExtensions.map((ext) => `${normalized}${ext}`),
          ...sourceExtensions.map((ext) => join(normalized, `index${ext}`))
        ]
      : [normalized]

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Source not found: ${path}`)
}

export async function resolveImport(from: string, specifier: string): Promise<string> {
  return resolveExistingSource(join(dirname(from), specifier))
}

export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../')
}
