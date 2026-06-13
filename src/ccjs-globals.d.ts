declare const fs: {
  readDir(path: string): Promise<Array<string>>
  readDirSync(path: string): Array<string>
  readFile(path: string, encoding?: 'utf8'): Promise<string>
  readFileBytes(path: string): Promise<Buffer>
  readFileBytesSync(path: string): Buffer
  readFileSync(path: string, encoding?: 'utf8'): string
  writeFile(path: string, text: string): Promise<void>
  writeFileBytes(path: string, bytes: Buffer): Promise<void>
  writeFileBytesSync(path: string, bytes: Buffer): void
  writeFileSync(path: string, text: string): void
}

declare const crypto: {
  getRandomValues<T extends Buffer | Uint8Array>(bytes: T): T
}
