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

  dirname(filePath: string): string {
    return dirnameNodeCompilerHost(filePath)
  }

  extname(filePath: string): string {
    return extnameNodeCompilerHost(filePath)
  }

  isAbsolutePath(filePath: string): boolean {
    return isAbsoluteNodeCompilerHost(filePath)
  }

  joinPath(left: string, right: string): string {
    return joinNodeCompilerHost(left, right)
  }

  normalizePath(filePath: string): string {
    return normalizeNodeCompilerHost(filePath)
  }

  pathToFileUrl(filePath: string): string {
    return pathToFileUrlNodeCompilerHost(filePath)
  }

  readFile(filePath: string): Promise<string> {
    return readFileNodeCompilerHost(filePath)
  }

  readFileSync(filePath: string): string | null {
    return readFileSyncNodeCompilerHost(filePath)
  }

  relativePath(fromPath: string, toPath: string): string {
    return relativeNodeCompilerHost(fromPath, toPath)
  }

  resolvePath(filePath: string): string {
    return resolveNodeCompilerHost(filePath)
  }

  shortHash(value: string): string {
    return shortHashNodeCompilerHost(value)
  }
}

export function basenameNodePosixPath(filePath: string): string {
  return posix.basename(filePath)
}

export function dirnameNodePosixPath(filePath: string): string {
  return posix.dirname(filePath)
}

export function extnameNodePosixPath(filePath: string): string {
  return posix.extname(filePath)
}

export function relativeNodePosixPath(fromPath: string, toPath: string): string {
  return posix.relative(fromPath, toPath)
}

export function dirnameNodeCompilerHost(filePath: string): string {
  return dirname(filePath)
}

export function extnameNodeCompilerHost(filePath: string): string {
  return extname(filePath)
}

export function isAbsoluteNodeCompilerHost(filePath: string): boolean {
  return isAbsolute(filePath)
}

export function joinNodeCompilerHost(left: string, right: string): string {
  return join(left, right)
}

export function normalizeNodeCompilerHost(filePath: string): string {
  return normalize(filePath)
}

export function pathToFileUrlNodeCompilerHost(filePath: string): string {
  return pathToFileURL(filePath).href
}

export function readFileNodeCompilerHost(filePath: string): Promise<string> {
  const source = readFileSyncNodeCompilerHost(filePath)

  if (source !== null && typeof source !== 'undefined') {
    return Promise.resolve(source)
  }

  return Promise.reject(new Error(`source not found: ${filePath}`))
}

export function readFileSyncNodeCompilerHost(filePath: string): string | null {
  try {
    return readNodeFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

export function relativeNodeCompilerHost(fromPath: string, toPath: string): string {
  return relative(fromPath, toPath)
}

export function resolveNodeCompilerHost(filePath: string): string {
  return resolve(filePath)
}

export function shortHashNodeCompilerHost(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}
