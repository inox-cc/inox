import type { CompilerHost } from '../host.ts'

const sourceExtensions = ['', '.ts', '.js']

export async function resolveExistingSource(path: string, host: CompilerHost): Promise<string> {
  let resolved = path

  if (!host.isAbsolutePath(path)) {
    resolved = host.resolvePath(path)
  }

  const normalized = host.normalizePath(resolved)
  const candidates: string[] = []

  if (host.extname(normalized) === '') {
    for (const ext of sourceExtensions) {
      candidates.push(`${normalized}${ext}`)
    }

    for (const ext of sourceExtensions) {
      candidates.push(host.joinPath(normalized, `index${ext}`))
    }
  } else {
    candidates.push(normalized)
  }

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

export async function resolveImport(fromPath: string, specifier: string, host: CompilerHost): Promise<string> {
  return resolveExistingSource(host.joinPath(host.dirname(fromPath), specifier), host)
}

export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../')
}
