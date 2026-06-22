import { createHash } from 'node:crypto'
import { readFileSync as readNodeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, normalize, posix, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CompilerHost, CompilerHostPosixPath } from './host.ts'

export function createNodeCompilerHost(): CompilerHost {
  return new NodeCompilerHost()
}

class NodeCompilerHost {
  pathSeparator: string
  posixPath: CompilerHostPosixPath

  constructor() {
    this.pathSeparator = sep
    this.posixPath = {
      basename: basenameNodePosixPath,
      dirname: dirnameNodePosixPath,
      extname: extnameNodePosixPath,
      relative: relativeNodePosixPath
    }
  }

  dirname(path: string): string {
    return dirnameNodeCompilerHost(path)
  }

  extname(path: string): string {
    return extnameNodeCompilerHost(path)
  }

  isAbsolutePath(path: string): boolean {
    return isAbsoluteNodeCompilerHost(path)
  }

  joinPath(left: string, right: string): string {
    return joinNodeCompilerHost(left, right)
  }

  normalizePath(path: string): string {
    return normalizeNodeCompilerHost(path)
  }

  pathToFileUrl(path: string): string {
    return pathToFileUrlNodeCompilerHost(path)
  }

  readFile(path: string): Promise<string> {
    return readFileNodeCompilerHost(path)
  }

  readFileSync(path: string): string | null {
    return readFileSyncNodeCompilerHost(path)
  }

  relativePath(fromPath: string, toPath: string): string {
    return relativeNodeCompilerHost(fromPath, toPath)
  }

  resolvePath(path: string): string {
    return resolveNodeCompilerHost(path)
  }

  shortHash(value: string): string {
    return shortHashNodeCompilerHost(value)
  }
}

export function basenameNodePosixPath(path: string): string {
  return posix.basename(path)
}

export function dirnameNodePosixPath(path: string): string {
  return posix.dirname(path)
}

export function extnameNodePosixPath(path: string): string {
  return posix.extname(path)
}

export function relativeNodePosixPath(fromPath: string, toPath: string): string {
  return posix.relative(fromPath, toPath)
}

export function dirnameNodeCompilerHost(path: string): string {
  return dirname(path)
}

export function extnameNodeCompilerHost(path: string): string {
  return extname(path)
}

export function isAbsoluteNodeCompilerHost(path: string): boolean {
  return isAbsolute(path)
}

export function joinNodeCompilerHost(left: string, right: string): string {
  return join(left, right)
}

export function normalizeNodeCompilerHost(path: string): string {
  return normalize(path)
}

export function pathToFileUrlNodeCompilerHost(path: string): string {
  return pathToFileURL(path).href
}

export function readFileNodeCompilerHost(path: string): Promise<string> {
  const source = readFileSyncNodeCompilerHost(path)

  if (source !== null && typeof source !== 'undefined') {
    return Promise.resolve(source)
  }

  return Promise.reject(new Error(`source not found: ${path}`))
}

export function readFileSyncNodeCompilerHost(path: string): string | null {
  try {
    return readNodeFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function relativeNodeCompilerHost(fromPath: string, toPath: string): string {
  return relative(fromPath, toPath)
}

export function resolveNodeCompilerHost(path: string): string {
  return resolve(path)
}

export function shortHashNodeCompilerHost(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}
