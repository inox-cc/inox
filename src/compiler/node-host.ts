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
    return dirname(path)
  }

  extname(path: string): string {
    return extname(path)
  }

  isAbsolutePath(path: string): boolean {
    return isAbsolute(path)
  }

  joinPath(left: string, right: string): string {
    return join(left, right)
  }

  normalizePath(path: string): string {
    return normalize(path)
  }

  pathToFileUrl(path: string): string {
    return pathToFileURL(path).href
  }

  readFile(path: string): Promise<string> {
    const source = this.readFileSync(path)

    if (source != null) {
      return Promise.resolve(source)
    }

    return Promise.reject(new Error(`source not found: ${path}`))
  }

  readFileSync(path: string): string | null {
    try {
      return readNodeFileSync(path, 'utf8')
    } catch {
      return null
    }
  }

  relativePath(fromPath: string, toPath: string): string {
    return relative(fromPath, toPath)
  }

  resolvePath(path: string): string {
    return resolve(path)
  }

  shortHash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 8)
  }
}

function basenameNodePosixPath(path: string): string {
  return posix.basename(path)
}

function dirnameNodePosixPath(path: string): string {
  return posix.dirname(path)
}

function extnameNodePosixPath(path: string): string {
  return posix.extname(path)
}

function relativeNodePosixPath(fromPath: string, toPath: string): string {
  return posix.relative(fromPath, toPath)
}
