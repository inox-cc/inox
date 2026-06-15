import type { CompilerHost } from '../host.ts'

const sourceExtensions = ['', '.ts', '.js']

export async function resolveExistingSource(path: string, host: CompilerHost): Promise<string> {
  const normalized = host.normalizePath(host.isAbsolutePath(path) ? path : host.resolvePath(path))
  const candidates =
    host.extname(normalized) === ''
      ? [
          ...sourceExtensions.map((ext) => `${normalized}${ext}`),
          ...sourceExtensions.map((ext) => host.joinPath(normalized, `index${ext}`))
        ]
      : [normalized]

  for (const candidate of candidates) {
    try {
      await host.readFile(candidate)
      return candidate
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Source not found: ${path}`)
}

export async function resolveImport(from: string, specifier: string, host: CompilerHost): Promise<string> {
  return resolveExistingSource(host.joinPath(host.dirname(from), specifier), host)
}

export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../')
}
