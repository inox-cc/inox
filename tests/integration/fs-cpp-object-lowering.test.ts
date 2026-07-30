import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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
const dirents = fs.readdirSync(dir, { withFileTypes: true })
const stats = fs.statSync(path)
const lstat = fs.lstatSync(path)
const real = fs.realpathSync(path)
const link = fs.readlinkSync(path)
const text = fs.readFileSync(path, 'utf8')
if (dirents.length > 0) {
  console.log(entries, dirents[0].name, stats.size, stats.mode, stats.mtimeMs, stats.isFile(), lstat.isFile(), real, link, text)
}
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
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /fs\.mkdirSync\(dir, true\);/)
  assert.match(source, /fs\.writeFileSync\(path, "hello"\);/)
  assert.match(source, /fs\.appendFileSync\(path, "!"\);/)
  assert.match(source, /fs\.readdirSync\(dir\);/)
  assert.match(source, /fs\.statSync\(path\);/)
  assert.match(source, /fs\.lstatSync\(path\);/)
  assert.match(source, /fs\.realpathSync\(path\);/)
  assert.match(source, /fs\.readlinkSync\(path\);/)
  assert.match(source, /fs\.readFileSync\(path, "utf8"\);/)
  assert.match(source, /fs\.unlinkSync\(path\);/)
  assert.match(source, /fs\.promises\.writeFile\(asyncPath, "async"\)/)
  assert.match(source, /fs\.promises\.appendFile\(asyncPath, "!"\)/)
  assert.match(source, /fs\.promises\.readFile\(asyncPath, "utf8"\)/)
  assert.match(source, /fs\.promises\.unlink\(asyncPath\)/)
  assert.match(source, /fs\.rmSync\(dir, true, true\);/)
  assert.match(source, /if \(inox::thrown\(\)\) return;/)
  assert.match(source, /stats\.size\(\)/)
  assert.match(source, /stats\.mode\(\)/)
  assert.match(source, /stats\.mtimeMs\(\)/)
  assert.match(source, /\.name\(\)/)
  assert.doesNotMatch(source, /inox::get\(stats,/)
  assert.doesNotMatch(source, /fs\.readFileSync\(&inox_default_allocator/)
  assert.doesNotMatch(source, /fs\.(readdirSync|statSync|lstatSync|realpathSync|readlinkSync)\(&inox_default_allocator/)
  assert.doesNotMatch(source, /fs\.(mkdirSync|writeFileSync|appendFileSync|unlinkSync|rmSync)\([^;\n]*\.bytes\(\)/)
  assert.doesNotMatch(source, /fs\.promises\.(writeFile|appendFile|readFile|unlink)\(inox::loop\(\)/)
  assert.doesNotMatch(source, /fs\.readFileSync\(inox::StringView/)
  assert.doesNotMatch(source, /inox_fs_value_\d+/)

  const header = readFileSync(resolve('stdlib/node/fs/include/inox/fs.h'), 'utf8')
  assert.match(header, /const FsConstants constants;/)
  assert.match(header, /Buffer readFileSync\(inox::StringView path\);/)
  assert.match(header, /inox::String readFileSync\(inox::StringView path, inox::StringView encoding\);/)
  assert.match(header, /Array readdirSync\(inox::StringView path, FsReadDirOptions options\);/)
  assert.match(header, /inox::Promise readFile\(inox::StringView path, inox::StringView encoding\);/)
  assert.match(header, /void writeFileSync\(inox::StringView path, Uint8Array bytes\);/)
  assert.doesNotMatch(header, /FsAdapter|setAdapter|getAdapter|clearAdapter/)
  assert.doesNotMatch(header, /readFileBytes|readdirDirents/)
  assert.doesNotMatch(header, /typedef .*\(\*Fs.*Fn\)/)
  assert.doesNotMatch(header, /const char\* path,[\s\S]*?size_t path_len,[\s\S]*?inox_value\* out/)
  assert.doesNotMatch(header, /const char\* bytes, size_t byte_len/)
  assert.doesNotMatch(header, /FsStats\(inox_value/)
  assert.doesNotMatch(header, /FsStats\(inox::AdoptValue/)
  assert.doesNotMatch(header, /FsDirent\(inox_value/)

  const fsSource = readFileSync(resolve('stdlib/node/fs/src/fs.cc'), 'utf8')
  assert.doesNotMatch(fsSource, /FsAdapter|fs_active_adapter/)
  assert.doesNotMatch(fsSource, /readFileBytesSync|readdirDirentsSync/)
  assert.doesNotMatch(fsSource, /FsStats::FsStats\(inox_value/)
  assert.doesNotMatch(fsSource, /FsStats::FsStats\(inox::AdoptValue/)
  assert.doesNotMatch(fsSource, /FsStats\(inox::adopt_value/)
  assert.doesNotMatch(fsSource, /FsDirent::FsDirent\(inox_value/)
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
