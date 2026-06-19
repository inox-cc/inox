import test from 'node:test'
import {
  assert,
  assertDiagnostic,
  cLibuvOptions,
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  compileFile,
  compileSource,
  CompileError,
  emitCBundleFromIrModules,
  emitCFromIr,
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
} from '../helpers/compiler-smoke.ts'



test('lowers fs awaits through async task frames', () => {
  const result = compileSource(
    `import fs from 'node:fs'

async function loadText(path: string): Promise<string> {
  const text = await fs.promises.readFile(path, 'utf8')

  return text
}

async function loadBytes(path: string): Promise<Buffer> {
  const bytes: Buffer = await fs.promises.readFile(path)

  return bytes
}

async function listEntries(path: string): Promise<Array<string>> {
  const entries: Array<string> = await fs.promises.readdir(path)

  return entries
}

async function saveText(path: string, text: string): Promise<void> {
  await fs.promises.writeFile(path, text)

  return
}

async function saveBytes(path: string, bytes: Buffer): Promise<void> {
  await fs.promises.writeFile(path, bytes)

  return
}

export async function main(): Promise<void> {
  console.log(await loadText('/tmp/in.txt'))
  await saveText('/tmp/out.txt', 'saved')
  const bytes = await loadBytes('/tmp/in.bin')
  await saveBytes('/tmp/out.bin', bytes)
  const entries = await listEntries('/tmp')
  console.log(entries.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_loadText_frame \{[\s\S]*inox_value param_path;[\s\S]*inox_value local_text;/
  )
  assert.match(result.code, /inox_retain\(frame->param_path\);/)
  assert.match(result.code, /inox_string \*path = \(inox_string \*\)frame->param_path\.as\.ref;/)
  assert.match(result.code, /status = inox_fs_read_file\(inox_loop, path->bytes, path->len, &frame->awaited\);/)
  assert.match(result.code, /frame->local_text = inox_value_input;\n {4}inox_retain\(frame->local_text\);/)
  assert.match(result.code, /inox_string \*text = \(inox_string \*\)frame->local_text\.as\.ref;/)
  assert.match(result.code, /status = inox_fs_read_file_bytes\(inox_loop, path->bytes, path->len, &frame->awaited\);/)
  assert.match(result.code, /status = inox_fs_read_dir\(inox_loop, path->bytes, path->len, &frame->awaited\);/)
  assert.match(
    result.code,
    /status = inox_fs_write_file\(inox_loop, path->bytes, path->len, text->bytes, text->len, &frame->awaited\);/
  )
  assert.match(
    result.code,
    /status = inox_fs_write_file_bytes\(inox_loop, path->bytes, path->len, bytes, &frame->awaited\);/
  )
  assert.match(result.code, /return inox_undefined_value\(\);/)
})


test('collects node:fs global usages for fs references', () => {
  const result = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.promises.writeFile('/private/tmp/inox-fs-smoke.txt', 'hello')
  const text = await fs.promises.readFile('/private/tmp/inox-fs-smoke.txt', 'utf8')
  console.log(text)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.root),
    ['fs', 'fs']
  )
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['fs.promises.writeFile', 'fs.promises.readFile']
  )

  const withoutFsUsage = compileSource(
    `export function main(): void {
  console.log('hello')
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(withoutFsUsage.ir.globalUsages, [])
})


test('lowers default node:fs import and fs.promises calls to the fs runtime', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const bytes = fs.promises.readFile('/tmp/value.bin')
  const text = fs.promises.readFile('/tmp/value.txt', 'utf8')
  const entries = fs.promises.readdir('/tmp')
  fs.promises.writeFile('/tmp/out.txt', 'saved')
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const bytes = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'bytes')
  const text = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'text')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')

  assert.equal(bytes?.promiseValueType, 'bytes')
  assert.equal(text?.promiseValueType, 'string')
  assert.equal(entries?.promiseValueType, 'array')
  assert.match(c.code, /inox_fs_read_file_bytes\(&inox_loop, "\/tmp\/value\.bin", 14, &bytes\)/)
  assert.match(c.code, /inox_fs_read_file\(&inox_loop, "\/tmp\/value\.txt", 14, &text\)/)
  assert.match(c.code, /inox_fs_read_dir\(&inox_loop, "\/tmp", 4, &entries\)/)
  assert.match(c.code, /inox_fs_write_file\(&inox_loop, "\/tmp\/out\.txt", 12, "saved", 5, &inox_promise_\d+\)/)
})


test('lowers Node fs stat lstat access and constants to the fs runtime', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const stats = await fs.promises.stat('/tmp/value.txt')
  const link = await fs.promises.lstat('/tmp/link.txt')
  await fs.promises.access('/tmp/value.txt', fs.constants.R_OK)
  fs.accessSync('/tmp/value.txt', fs.constants.W_OK)
  const syncStats = fs.statSync('/tmp/value.txt')
  const ok = stats.isFile() && !syncStats.isDirectory()
  console.log(stats.size, link.mode, ok)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const stats = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'stats')
  const syncStats = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'syncStats')

  assert.equal(stats?.valueType, 'object')
  assert.equal(stats?.init?.shape?.builtin, 'fs.Stats')
  assert.equal(syncStats?.init?.shape?.builtin, 'fs.Stats')
  assert.deepEqual(
    stats?.init?.shape?.fields.map((field) => field.name),
    ['size', 'mode', 'mtimeMs']
  )
  assert.match(c.code, /inox_fs_stat\(&inox_loop, "\/tmp\/value\.txt", 14, &inox_promise_\d+\)/)
  assert.match(c.code, /inox_fs_lstat\(&inox_loop, "\/tmp\/link\.txt", 13, &inox_promise_\d+\)/)
  assert.match(c.code, /inox_fs_access\(&inox_loop, "\/tmp\/value\.txt", 14, \(\(int\)INOX_FS_R_OK\), &inox_promise_\d+\)/)
  assert.match(c.code, /inox_fs_access_sync\("\/tmp\/value\.txt", 14, \(\(int\)INOX_FS_W_OK\)\)/)
  assert.match(
    c.code,
    /if \(inox_fs_stat_sync\(&inox_default_allocator, "\/tmp\/value\.txt", 14, &inox_fs_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /inox_fs_stats_is_file\(stats\)/)
  assert.match(c.code, /inox_fs_stats_is_directory\(syncStats\)/)
})


test('lowers Node fs mutation helpers to the fs runtime', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const mkdirPromise = fs.promises.mkdir('/tmp/inox-dir/nested', { recursive: true })
  fs.promises.rename('/tmp/input.txt', '/tmp/renamed.txt')
  fs.promises.unlink('/tmp/renamed.txt')
  fs.promises.rm('/tmp/inox-dir', { recursive: true, force: true })
  fs.mkdirSync('/tmp/inox-sync/nested', { recursive: true })
  fs.renameSync('/tmp/sync-input.txt', '/tmp/sync-renamed.txt')
  fs.unlinkSync('/tmp/sync-renamed.txt')
  fs.rmSync('/tmp/inox-sync', { recursive: true, force: true })
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const mkdirPromise = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'mkdirPromise')

  assert.equal(mkdirPromise?.valueType, 'promise')
  assert.equal(mkdirPromise?.promiseValueType, 'void')
  assert.equal(mkdirPromise?.init?.fsRecursive, true)
  assert.deepEqual(c.ir.runtimeRequirements, ['async-runtime', 'fs', 'managed-values', 'objects'])
  assert.match(c.code, /inox_fs_mkdir\(&inox_loop, "\/tmp\/inox-dir\/nested", 20, true, &mkdirPromise\)/)
  assert.match(
    c.code,
    /inox_fs_rename\(&inox_loop, "\/tmp\/input\.txt", 14, "\/tmp\/renamed\.txt", 16, &inox_promise_\d+\)/
  )
  assert.match(c.code, /inox_fs_unlink\(&inox_loop, "\/tmp\/renamed\.txt", 16, &inox_promise_\d+\)/)
  assert.match(c.code, /inox_fs_rm\(&inox_loop, "\/tmp\/inox-dir", 13, true, true, &inox_promise_\d+\)/)
  assert.match(c.code, /inox_fs_mkdir_sync\("\/tmp\/inox-sync\/nested", 21, true\)/)
  assert.match(c.code, /inox_fs_rename_sync\("\/tmp\/sync-input\.txt", 19, "\/tmp\/sync-renamed\.txt", 21\)/)
  assert.match(c.code, /inox_fs_unlink_sync\("\/tmp\/sync-renamed\.txt", 21\)/)
  assert.match(c.code, /inox_fs_rm_sync\("\/tmp\/inox-sync", 14, true, true\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  const recursive = true
  fs.promises.mkdir('/tmp/inox-dir', { recursive })
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('lowers Node fs append and copy helpers to the fs runtime', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const bytes = fs.readFileSync('/tmp/value.bin')
  const appendPromise = fs.promises.appendFile('/tmp/out.bin', bytes)
  fs.promises.copyFile('/tmp/out.bin', '/tmp/log.copy.txt')
  fs.appendFileSync('/tmp/sync.bin', bytes)
  fs.copyFileSync('/tmp/sync.bin', '/tmp/sync-log.copy.txt')
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const appendPromise = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'appendPromise')

  assert.equal(appendPromise?.valueType, 'promise')
  assert.equal(appendPromise?.promiseValueType, 'void')
  assert.equal(appendPromise?.init?.fsRuntimeMethod, 'appendFileBytes')
  assert.match(c.code, /inox_fs_read_file_bytes_sync\(&inox_default_allocator, "\/tmp\/value\.bin", 14, &inox_fs_value_\d+\)/)
  assert.match(c.code, /inox_fs_append_file_bytes\(&inox_loop, "\/tmp\/out\.bin", 12, bytes, &appendPromise\)/)
  assert.match(
    c.code,
    /inox_fs_copy_file\(&inox_loop, "\/tmp\/out\.bin", 12, "\/tmp\/log\.copy\.txt", 17, &inox_promise_\d+\)/
  )
  assert.match(c.code, /inox_fs_append_file_bytes_sync\("\/tmp\/sync\.bin", 13, bytes\)/)
  assert.match(c.code, /inox_fs_copy_file_sync\("\/tmp\/sync\.bin", 13, "\/tmp\/sync-log\.copy\.txt", 22\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.copyFile('/tmp/a', '/tmp/b', 1)
}
`,
    'INOX_ARG_COUNT'
  )
})


test('lowers Node fs readdir withFileTypes to Dirent runtime values', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const entries = fs.promises.readdir('/tmp', { withFileTypes: true })
  const syncEntries = fs.readdirSync('/tmp', { withFileTypes: true })
  const first = syncEntries[0]
  console.log(first.name, first.isFile(), first.isDirectory())
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')
  const syncEntries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'syncEntries')
  const first = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'first')

  assert.equal(entries?.promiseValueType, 'array')
  assert.equal(entries?.arrayElementType, 'object')
  assert.equal(entries?.arrayElementDeclaredType, 'fs.Dirent')
  assert.equal(syncEntries?.arrayElementDeclaredType, 'fs.Dirent')
  assert.equal(first?.arrayElementDeclaredType, 'fs.Dirent')
  assert.equal(first?.init?.shape?.builtin, 'fs.Dirent')
  assert.match(c.code, /inox_fs_read_dir_dirents\(&inox_loop, "\/tmp", 4, &entries\)/)
  assert.match(
    c.code,
    /inox_fs_read_dir_dirents_sync\(&inox_default_allocator, "\/tmp", 4, &inox_fs_value_\d+\)/
  )
  assert.match(c.code, /inox_fs_dirent_is_file\(first\)/)
  assert.match(c.code, /inox_fs_dirent_is_directory\(first\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.readdir('/tmp', { withFileTypes: true, recursive: true })
}
`,
    'INOX_UNKNOWN_FIELD'
  )
})


test('lowers Node fs link path helpers to the fs runtime', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const real = fs.promises.realpath('/tmp/value.txt')
  const link = fs.promises.readlink('/tmp/link.txt')
  fs.promises.symlink('/tmp/value.txt', '/tmp/link.txt')
  const syncReal = fs.realpathSync('/tmp/value.txt')
  const syncLink = fs.readlinkSync('/tmp/link.txt')
  fs.symlinkSync('/tmp/value.txt', '/tmp/sync-link.txt')
  console.log(syncReal, syncLink)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const real = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'real')
  const link = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'link')

  assert.equal(real?.promiseValueType, 'string')
  assert.equal(link?.promiseValueType, 'string')
  assert.match(c.code, /inox_fs_realpath\(&inox_loop, "\/tmp\/value\.txt", 14, &real\)/)
  assert.match(c.code, /inox_fs_readlink\(&inox_loop, "\/tmp\/link\.txt", 13, &link\)/)
  assert.match(
    c.code,
    /inox_fs_symlink\(&inox_loop, "\/tmp\/value\.txt", 14, "\/tmp\/link\.txt", 13, &inox_promise_\d+\)/
  )
  assert.match(c.code, /inox_fs_realpath_sync\(&inox_default_allocator, "\/tmp\/value\.txt", 14, &inox_fs_value_\d+\)/)
  assert.match(c.code, /inox_fs_readlink_sync\(&inox_default_allocator, "\/tmp\/link\.txt", 13, &inox_fs_value_\d+\)/)
  assert.match(c.code, /inox_fs_symlink_sync\("\/tmp\/value\.txt", 14, "\/tmp\/sync-link\.txt", 18\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.symlink('/tmp/value.txt')
}
`,
    'INOX_ARG_COUNT'
  )
})


test('lowers node:fs/promises imports to the fs runtime', () => {
  const c = compileSource(
    `import fs from 'node:fs/promises'

export function main(): void {
  const bytes = fs.readFile('/tmp/value.bin')
  const text = fs.readFile('/tmp/value.txt', 'utf8')
  const entries = fs.readdir('/tmp')
  fs.writeFile('/tmp/out.txt', 'saved')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /inox_fs_read_file_bytes\(&inox_loop, "\/tmp\/value\.bin", 14, &bytes\)/)
  assert.match(c.code, /inox_fs_read_file\(&inox_loop, "\/tmp\/value\.txt", 14, &text\)/)
  assert.match(c.code, /inox_fs_read_dir\(&inox_loop, "\/tmp", 4, &entries\)/)
  assert.match(c.code, /inox_fs_write_file\(&inox_loop, "\/tmp\/out\.txt", 12, "saved", 5, &inox_promise_\d+\)/)
})

test('lowers named node:fs imports to the fs runtime', () => {
  const c = compileSource(
    `import { readFileSync as readNodeFileSync } from 'node:fs'
import { readFile as readNodeFile } from 'node:fs/promises'

export async function load(path: string): Promise<string> {
  const text = readNodeFileSync(path, 'utf8')
  const asyncText = await readNodeFile(path, 'utf8')

  return text + asyncText
}
`,
    {
      target: 'c'
    }
  )
  const load = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'load')
  const text = load?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'text')
  const asyncText = load?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'asyncText')

  assert.equal(text?.valueType, 'string')
  assert.equal(text?.init?.fsRuntimeMethod, 'readFileSync')
  assert.equal(asyncText?.valueType, 'string')
  assert.equal(asyncText?.init?.argument?.fsRuntimeMethod, 'readFile')
  assert.match(c.code, /inox_fs_read_file_sync\(&inox_default_allocator, path->bytes, path->len, &inox_fs_value_\d+\)/)
  assert.match(c.code, /inox_fs_read_file\(&inox_loop, path->bytes, path->len, &inox_promise_\d+\)/)
})


test('maps Node fs binary reads to Buffer-compatible C runtime calls', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const bytes = await fs.promises.readFile('/tmp/value.bin')
  await fs.promises.writeFile('/tmp/out.bin', bytes)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const bytes = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'bytes')

  assert.ok(bytes)
  assert.equal(bytes.valueType, 'bytes')
  assert.match(c.code, /#include "inox\/fs\.h"/)
  assert.match(c.code, /inox_value bytes = inox_undefined_value\(\);/)
  assert.match(
    c.code,
    /if \(inox_fs_read_file_bytes\(&inox_loop, "\/tmp\/value\.bin", 14, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /if \(bytes\.tag != INOX_TAG_BYTES \|\| bytes\.as\.ref == 0\)\s+goto inox_cleanup;/)
  assert.match(
    c.code,
    /if \(inox_fs_write_file_bytes\(&inox_loop, "\/tmp\/out\.bin", 12, bytes, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.writeFileBytes('/tmp/out.bin', Buffer.from('text'))
}
`,
    'INOX_FS_UNSUPPORTED'
  )
})


test('maps fs sync helpers to C runtime calls', () => {
  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const text = fs.readFileSync('/tmp/value.txt', 'utf8')
  const bytes = fs.readFileSync('/tmp/value.bin')
  const entries = fs.readdirSync('/tmp')
  fs.writeFileSync('/tmp/out.txt', text)
  fs.writeFileSync('/tmp/out.bin', bytes)
  console.log(entries.length)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const text = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'text')
  const bytes = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'bytes')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')

  assert.equal(text?.valueType, 'string')
  assert.equal(bytes?.valueType, 'bytes')
  assert.equal(entries?.valueType, 'array')
  assert.equal(entries?.arrayElementType, 'string')
  assert.match(
    c.code,
    /if \(inox_fs_read_file_sync\(&inox_default_allocator, "\/tmp\/value\.txt", 14, &inox_fs_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    c.code,
    /if \(inox_fs_read_file_bytes_sync\(&inox_default_allocator, "\/tmp\/value\.bin", 14, &inox_fs_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    c.code,
    /if \(inox_fs_read_dir_sync\(&inox_default_allocator, "\/tmp", 4, &inox_fs_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    c.code,
    /if \(inox_fs_write_file_sync\("\/tmp\/out\.txt", 12, text->bytes, text->len\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    c.code,
    /if \(inox_fs_write_file_bytes_sync\("\/tmp\/out\.bin", 12, bytes\) != INOX_OK\)\s+goto inox_cleanup;/
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.writeFileBytesSync('/tmp/out.bin', Buffer.from('text'))
}
`,
    'INOX_FS_UNSUPPORTED'
  )
})


test('lowers fs.promises readFile, readdir and writeFile to the C fs runtime', () => {
  const result = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const read = fs.promises.readFile('/tmp/value.txt', 'utf8')
  const entries = fs.promises.readdir('/tmp')
  fs.promises.writeFile('/tmp/out.txt', 'saved')
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const read = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'read')

  assert.ok(read)
  assert.equal(read.valueType, 'promise')
  assert.equal(read.promiseValueType, 'string')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')

  assert.ok(entries)
  assert.equal(entries.valueType, 'promise')
  assert.equal(entries.promiseValueType, 'array')
  assert.equal(entries.arrayElementType, 'string')
  assert.deepEqual(result.ir.features, ['async-runtime', 'fs'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime', 'fs'])
  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /#include "inox\/fs\.h"/)
  assert.match(result.code, /inox_loop inox_loop;/)
  assert.match(result.code, /inox_promise \*read = 0;/)
  assert.match(result.code, /inox_promise \*entries = 0;/)
  assert.match(result.code, /inox_promise \*inox_promise_\d+ = 0;/)
  assert.match(
    result.code,
    /if \(inox_loop_init\(&inox_loop, &inox_default_allocator\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_fs_read_file\(&inox_loop, "\/tmp\/value\.txt", 14, &read\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /if \(inox_fs_read_dir\(&inox_loop, "\/tmp", 4, &entries\) != INOX_OK\)\s+goto inox_cleanup;/)
  assert.match(
    result.code,
    /if \(inox_fs_write_file\(&inox_loop, "\/tmp\/out\.txt", 12, "saved", 5, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /if \(read != 0\) inox_promise_release\(read\);/)
  assert.match(result.code, /if \(entries != 0\) inox_promise_release\(entries\);/)
  assert.match(result.code, /if \(inox_loop_active\) inox_loop_dispose\(&inox_loop\);/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.writeFile('/tmp/out.txt')
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.readdir('/tmp', 'utf8', 'extra')
}
`,
    'INOX_ARG_COUNT'
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.readFile('/tmp/value.txt', 'utf8')
}
`,
    'INOX_FS_UNSUPPORTED'
  )
})
