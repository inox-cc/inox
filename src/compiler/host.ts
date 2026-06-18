export type CompilerHostPosixPath = {
  basename(path: string): string
  dirname(path: string): string
  extname(path: string): string
  relative(from: string, to: string): string
}

export type CompilerHost = {
  pathSeparator: string
  posixPath: CompilerHostPosixPath
  dirname(path: string): string
  extname(path: string): string
  isAbsolutePath(path: string): boolean
  joinPath(left: string, right: string): string
  normalizePath(path: string): string
  pathToFileUrl(path: string): string
  readFile(path: string): Promise<string>
  readFileSync(path: string): string | null
  relativePath(from: string, to: string): string
  resolvePath(path: string): string
  shortHash(value: string): string
}

export function requireCompilerHost(host: CompilerHost | undefined, caller: string): CompilerHost {
  if (host == null) {
    throw new Error(`${caller} requires a compiler host`)
  }

  return host
}
