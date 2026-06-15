import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, posix, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CompilerHost } from './host.ts'

export function createNodeCompilerHost(): CompilerHost {
  return {
    pathSeparator: sep,
    posixPath: {
      basename: posix.basename,
      dirname: posix.dirname,
      extname: posix.extname,
      relative: posix.relative
    },
    dirname,
    extname,
    isAbsolutePath: isAbsolute,
    joinPath: join,
    normalizePath: normalize,
    pathToFileUrl(path: string): string {
      return pathToFileURL(path).href
    },
    readFile(path: string): Promise<string> {
      return readFile(path, 'utf8')
    },
    relativePath: relative,
    resolvePath: resolve,
    shortHash(value: string): string {
      return createHash('sha256').update(value).digest('hex').slice(0, 8)
    }
  }
}
