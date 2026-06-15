import type { CompilerHost } from './host.ts'

export type MemoryCompilerSourceFile = {
  path: string
  source: string
}

export type MemoryCompilerHostOptions = {
  root?: string
}

export function createMemoryCompilerHost(
  files: MemoryCompilerSourceFile[],
  options: MemoryCompilerHostOptions = {}
): CompilerHost {
  const root = normalizePosixPath(options.root ?? '/')
  const sources: MemoryCompilerSourceFile[] = []

  for (const file of files) {
    sources.push({
      path: resolvePosixPath(file.path, root),
      source: file.source
    })
  }

  return {
    pathSeparator: '/',
    posixPath: {
      basename: basenamePosixPath,
      dirname: dirnamePosixPath,
      extname: extnamePosixPath,
      relative: relativePosixPath
    },
    dirname: dirnamePosixPath,
    extname: extnamePosixPath,
    isAbsolutePath: isAbsolutePosixPath,
    joinPath: joinPosixPath,
    normalizePath: normalizePosixPath,
    pathToFileUrl(path: string): string {
      return `file://${resolvePosixPath(path, root)}`
    },
    async readFile(path: string): Promise<string> {
      const resolved = resolvePosixPath(path, root)

      for (const file of sources) {
        if (file.path === resolved) {
          return file.source
        }
      }

      throw new Error(`memory source not found: ${path}`)
    },
    relativePath: relativePosixPath,
    resolvePath(path: string): string {
      return resolvePosixPath(path, root)
    },
    shortHash: shortStableHash
  }
}

function isAbsolutePosixPath(path: string): boolean {
  return path.startsWith('/')
}

function resolvePosixPath(path: string, root: string): string {
  return normalizePosixPath(isAbsolutePosixPath(path) ? path : joinPosixPath(root, path))
}

function joinPosixPath(left: string, right: string): string {
  if (right === '') {
    return normalizePosixPath(left)
  }

  if (isAbsolutePosixPath(right)) {
    return normalizePosixPath(right)
  }

  return normalizePosixPath(left === '' || left.endsWith('/') ? `${left}${right}` : `${left}/${right}`)
}

function normalizePosixPath(path: string): string {
  if (path === '') {
    return '.'
  }

  const absolute = isAbsolutePosixPath(path)
  const parts = path.split('/')
  const normalized: string[] = []

  for (const part of parts) {
    if (part === '' || part === '.') {
      continue
    }

    if (part === '..') {
      const last = normalized[normalized.length - 1]

      if (last != null && last !== '..') {
        normalized.pop()
      } else if (!absolute) {
        normalized.push(part)
      }

      continue
    }

    normalized.push(part)
  }

  const joined = normalized.join('/')

  if (absolute) {
    return joined === '' ? '/' : `/${joined}`
  }

  return joined === '' ? '.' : joined
}

function dirnamePosixPath(path: string): string {
  const normalized = normalizePosixPath(path)

  if (normalized === '/') {
    return '/'
  }

  const index = normalized.lastIndexOf('/')

  if (index < 0) {
    return '.'
  }

  if (index === 0) {
    return '/'
  }

  return normalized.slice(0, index)
}

function basenamePosixPath(path: string): string {
  const normalized = normalizePosixPath(path)

  if (normalized === '/') {
    return '/'
  }

  const index = normalized.lastIndexOf('/')

  return index < 0 ? normalized : normalized.slice(index + 1)
}

function extnamePosixPath(path: string): string {
  const base = basenamePosixPath(path)
  const index = base.lastIndexOf('.')

  if (index <= 0) {
    return ''
  }

  return base.slice(index)
}

function relativePosixPath(from: string, to: string): string {
  const fromParts = splitNormalizedPosixPath(from)
  const toParts = splitNormalizedPosixPath(to)
  let shared = 0

  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1
  }

  const parts: string[] = []

  for (let index = shared; index < fromParts.length; index += 1) {
    parts.push('..')
  }

  for (let index = shared; index < toParts.length; index += 1) {
    parts.push(toParts[index])
  }

  return parts.join('/')
}

function splitNormalizedPosixPath(path: string): string[] {
  const normalized = normalizePosixPath(path)

  if (normalized === '/' || normalized === '.') {
    return []
  }

  return normalized.startsWith('/') ? normalized.slice(1).split('/') : normalized.split('/')
}

function shortStableHash(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = (hash * 16777619) >>> 0
  }

  return hash.toString(16).padStart(8, '0').slice(0, 8)
}
