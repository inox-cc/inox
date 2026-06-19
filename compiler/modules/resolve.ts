import type { CompilerHost } from '../host.ts'
import { isPresent } from '../nullish.ts'

const sourceExtensions = ['', '.ts', '.js']

export function resolveExistingSource(path: string, host: CompilerHost): string {
  let resolved = path

  if (!host.isAbsolutePath(path)) {
    resolved = host.resolvePath(path)
  }

  const normalized = host.normalizePath(resolved)
  const candidates: string[] = []

  if (host.extname(normalized) === '') {
    candidates.push(normalized)
    candidates.push(`${normalized}.ts`)
    candidates.push(`${normalized}.js`)

    for (const ext of sourceExtensions) {
      candidates.push(host.joinPath(normalized, `index${ext}`))
    }
  } else {
    candidates.push(normalized)
  }

  for (let index = 0; index < candidates.length; index = index + 1) {
    const candidate = candidates[index]

    if (isPresent(host.readFileSync(candidate))) {
      return candidate
    }
  }

  throw new Error(`Source not found: ${path}`)
}

export function resolveImport(fromPath: string, specifier: string, host: CompilerHost): string {
  return resolveExistingSource(host.joinPath(host.dirname(fromPath), specifier), host)
}

export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../')
}
