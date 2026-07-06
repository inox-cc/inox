import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertFsReadFileSyncLowersToCppObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import fs from 'node:fs'

const dir = '/tmp/inox-fs-dir'
const path = '/tmp/inox-fs.txt'
const asyncPath = '/tmp/inox-fs-async.txt'
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path, 'hello')
fs.appendFileSync(path, '!')
const entries = fs.readdirSync(dir)
const stats = fs.statSync(path)
const lstat = fs.lstatSync(path)
const real = fs.realpathSync(path)
const link = fs.readlinkSync(path)
const text = fs.readFileSync(path, 'utf8')
console.log(entries, stats.isFile(), lstat.isFile(), real, link, text)
fs.unlinkSync(path)
await fs.promises.writeFile(asyncPath, 'async')
await fs.promises.appendFile(asyncPath, '!')
const asyncText = await fs.promises.readFile(asyncPath, 'utf8')
console.log(asyncText)
await fs.promises.unlink(asyncPath)
fs.rmSync(dir, { recursive: true, force: true })
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /fs\.mkdirSync\(dir, true\);/)
  assert.match(source, /fs\.writeFileSync\(path, "hello"\);/)
  assert.match(source, /fs\.appendFileSync\(path, "!"\);/)
  assert.match(source, /auto fs_value_\d+ = fs\.readdirSync\(dir\);/)
  assert.match(source, /auto fs_value_\d+ = fs\.statSync\(path\);/)
  assert.match(source, /auto fs_value_\d+ = fs\.lstatSync\(path\);/)
  assert.match(source, /auto fs_value_\d+ = fs\.realpathSync\(path\);/)
  assert.match(source, /auto fs_value_\d+ = fs\.readlinkSync\(path\);/)
  assert.match(source, /auto fs_value_\d+ = fs\.readFileSync\(path\);/)
  assert.match(source, /fs\.unlinkSync\(path\);/)
  assert.match(source, /fs\.promises\.writeFile\(asyncPath, "async"\)/)
  assert.match(source, /fs\.promises\.appendFile\(asyncPath, "!"\)/)
  assert.match(source, /fs\.promises\.readFile\(asyncPath\)/)
  assert.match(source, /fs\.promises\.unlink\(asyncPath\)/)
  assert.match(source, /fs\.rmSync\(dir, true, true\);/)
  assert.match(source, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /fs\.readFileSync\(&inox_default_allocator/)
  assert.doesNotMatch(source, /fs\.(readdirSync|statSync|lstatSync|realpathSync|readlinkSync)\(&inox_default_allocator/)
  assert.doesNotMatch(source, /fs\.(mkdirSync|writeFileSync|appendFileSync|unlinkSync|rmSync)\([^;\n]*\.bytes\(\)/)
  assert.doesNotMatch(source, /fs\.promises\.(writeFile|appendFile|readFile|unlink)\(inox::loop\(\)/)
  assert.doesNotMatch(source, /fs\.readFileSync\(inox::StringView/)
  assert.doesNotMatch(source, /inox_fs_value_\d+/)

  const header = readFileSync(resolve('stdlib/node/fs/include/inox/fs.h'), 'utf8')
  assert.match(header, /typedef inox::String \(\*FsReadFileFn\)\(void\* user, inox::StringView path\);/)
  assert.match(header, /typedef Buffer \(\*FsReadFileBytesFn\)\(void\* user, inox::StringView path\);/)
  assert.match(header, /typedef ArrayClass \(\*FsReadDirFn\)\(void\* user, inox::StringView path\);/)
  assert.match(header, /typedef ArrayClass \(\*FsReadDirDirentsFn\)\(void\* user, inox::StringView path\);/)
  assert.match(header, /typedef inox::String \(\*FsStringPathFn\)\([\s\S]*?void\* user,[\s\S]*?inox::StringView path[\s\S]*?\);/)
  assert.match(header, /typedef void \(\*FsWriteFileFn\)\(void\* user, inox::StringView path, inox::StringView bytes\);/)
  assert.match(header, /typedef void \(\*FsCopyFileFn\)\(void\* user, inox::StringView src_path, inox::StringView dest_path\);/)
  assert.doesNotMatch(header, /typedef inox_status \(\*FsReadFileFn\)/)
  assert.doesNotMatch(header, /FsReadFileFn\)\([^;]*inox_allocator\* allocator/)
  assert.doesNotMatch(header, /FsReadFileFn\)\([^;]*inox_value\* out/)
  assert.doesNotMatch(header, /typedef inox_status \(\*FsReadFileBytesFn\)/)
  assert.doesNotMatch(header, /FsReadFileBytesFn\)\([^;]*inox_allocator\* allocator/)
  assert.doesNotMatch(header, /FsReadFileBytesFn\)\([^;]*inox_value\* out/)
  assert.doesNotMatch(header, /typedef inox_status \(\*FsReadDirFn\)/)
  assert.doesNotMatch(header, /typedef inox_status \(\*FsReadDirDirentsFn\)/)
  assert.doesNotMatch(header, /FsReadDirFn\)\([^;]*inox_allocator\* allocator/)
  assert.doesNotMatch(header, /FsReadDirFn\)\([^;]*inox_value\* out/)
  assert.doesNotMatch(header, /FsReadDirDirentsFn\)\([^;]*inox_allocator\* allocator/)
  assert.doesNotMatch(header, /FsReadDirDirentsFn\)\([^;]*inox_value\* out/)
  assert.doesNotMatch(header, /typedef inox_status \(\*FsStringPathFn\)/)
  assert.doesNotMatch(header, /FsStringPathFn\)\([^;]*inox_allocator\* allocator/)
  assert.doesNotMatch(header, /FsStringPathFn\)\([^;]*inox_value\* out/)
  assert.doesNotMatch(header, /typedef inox_status \(\*Fs(?:Access|Mkdir|Unlink|Rm|AppendFile|CopyFile|Symlink|Rename|WriteFile)Fn\)/)
  assert.doesNotMatch(header, /const char\* path,[\s\S]*?size_t path_len,[\s\S]*?inox_value\* out/)
  assert.doesNotMatch(header, /const char\* bytes, size_t byte_len/)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertFsReadFileSyncLowersToCppObject()
}
