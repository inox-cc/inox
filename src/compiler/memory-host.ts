import type { CompilerHost, CompilerHostPosixPath } from './host.ts'

export type MemoryCompilerSourceFile = {
  path: string
  source: string
}

export type MemoryCompilerHostOptions = {
  root?: string
}

export function createMemoryCompilerHost(
  files: MemoryCompilerSourceFile[],
  options: MemoryCompilerHostOptions
): CompilerHost {
  return new MemoryCompilerHost(files, options)
}

class MemoryCompilerHost {
  pathSeparator: string
  posixPath: CompilerHostPosixPath
  root: string
  sources: MemoryCompilerSourceFile[]

  constructor(files: MemoryCompilerSourceFile[], options: MemoryCompilerHostOptions) {
    this.pathSeparator = '/'
    this.posixPath = {
      basename: basenamePosixPath,
      dirname: dirnamePosixPath,
      extname: extnamePosixPath,
      relative: relativePosixPath
    }
    this.root = memoryCompilerHostRoot(options)
    this.sources = normalizeMemoryCompilerSources(files, this.root)
  }

  dirname(path: string): string {
    return dirnamePosixPath(path)
  }

  extname(path: string): string {
    return extnamePosixPath(path)
  }

  isAbsolutePath(path: string): boolean {
    return isAbsolutePosixPath(path)
  }

  joinPath(left: string, right: string): string {
    return joinPosixPath(left, right)
  }

  normalizePath(path: string): string {
    return normalizePosixPath(path)
  }

  pathToFileUrl(path: string): string {
    return `file://${resolvePosixPath(path, this.root)}`
  }

  readFile(path: string): Promise<string> {
    const resolved = resolvePosixPath(path, this.root)

    for (let index = 0; index < this.sources.length; index = index + 1) {
      const file = this.sources[index]

      if (file.path === resolved) {
        return Promise.resolve(file.source)
      }
    }

    return Promise.reject(new Error(`memory source not found: ${path}`))
  }

  relativePath(fromPath: string, toPath: string): string {
    return relativePosixPath(fromPath, toPath)
  }

  resolvePath(path: string): string {
    return resolvePosixPath(path, this.root)
  }

  shortHash(value: string): string {
    return shortStableHash(value)
  }
}

function normalizeMemoryCompilerSources(files: MemoryCompilerSourceFile[], root: string): MemoryCompilerSourceFile[] {
  const sources: MemoryCompilerSourceFile[] = []

  for (let index = 0; index < files.length; index = index + 1) {
    const file = files[index]
    sources.push({
      path: resolvePosixPath(file.path, root),
      source: file.source
    })
  }

  return sources
}

function memoryCompilerHostRoot(options: MemoryCompilerHostOptions): string {
  let root = '/'
  const configuredRoot = options.root

  if (configuredRoot != null) {
    root = configuredRoot
  }

  return normalizePosixPath(root)
}

function isAbsolutePosixPath(path: string): boolean {
  return path.startsWith('/')
}

function resolvePosixPath(path: string, root: string): string {
  let resolved = path

  if (!isAbsolutePosixPath(path)) {
    resolved = joinPosixPath(root, path)
  }

  return normalizePosixPath(resolved)
}

function joinPosixPath(left: string, right: string): string {
  if (right === '') {
    return normalizePosixPath(left)
  }

  if (isAbsolutePosixPath(right)) {
    return normalizePosixPath(right)
  }

  let joined = `${left}/${right}`

  if (left === '' || left.endsWith('/')) {
    joined = `${left}${right}`
  }

  return normalizePosixPath(joined)
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
      if (normalized.length > 0) {
        const last = normalized[normalized.length - 1]

        if (last !== '..') {
          normalized.pop()
          continue
        }
      }

      if (!absolute) {
        normalized.push(part)
      }

      continue
    }

    normalized.push(part)
  }

  const joined = normalized.join('/')

  if (absolute) {
    if (joined === '') {
      return '/'
    }

    return `/${joined}`
  }

  if (joined === '') {
    return '.'
  }

  return joined
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

  if (index < 0) {
    return normalized
  }

  return normalized.slice(index + 1)
}

function extnamePosixPath(path: string): string {
  const base = basenamePosixPath(path)
  const index = base.lastIndexOf('.')

  if (index <= 0) {
    return ''
  }

  return base.slice(index)
}

function relativePosixPath(fromPath: string, toPath: string): string {
  const fromParts = splitNormalizedPosixPath(fromPath)
  const toParts = splitNormalizedPosixPath(toPath)
  let shared = 0

  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared = shared + 1
  }

  const parts: string[] = []

  for (let index = shared; index < fromParts.length; index = index + 1) {
    parts.push('..')
  }

  for (let index = shared; index < toParts.length; index = index + 1) {
    parts.push(toParts[index])
  }

  return parts.join('/')
}

function splitNormalizedPosixPath(path: string): string[] {
  const normalized = normalizePosixPath(path)

  if (normalized === '/' || normalized === '.') {
    return []
  }

  if (normalized.startsWith('/')) {
    return normalized.slice(1).split('/')
  }

  return normalized.split('/')
}

function shortStableHash(value: string): string {
  let hash = 2166136261
  const modulus = 4294967291
  const multiplier = 65599

  for (let index = 0; index < value.length; index = index + 1) {
    hash = (hash * multiplier + value.charCodeAt(index)) % modulus
  }

  return shortHashHex(hash)
}

function shortHashHex(value: number): string {
  let hex = value.toString(16)

  while (hex.length < 8) {
    hex = `0${hex}`
  }

  if (hex.length > 8) {
    return hex.slice(0, 8)
  }

  return hex
}
