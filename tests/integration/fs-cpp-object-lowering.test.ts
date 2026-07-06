import assert from 'node:assert/strict'
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
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path, 'hello')
fs.appendFileSync(path, '!')
const text = fs.readFileSync(path, 'utf8')
console.log(text)
fs.unlinkSync(path)
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
  assert.match(source, /auto text_\d+ = fs\.readFileSync\(path\);/)
  assert.match(source, /fs\.unlinkSync\(path\);/)
  assert.match(source, /fs\.rmSync\(dir, true, true\);/)
  assert.match(source, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(source, /fs\.readFileSync\(&inox_default_allocator/)
  assert.doesNotMatch(source, /fs\.(mkdirSync|writeFileSync|appendFileSync|unlinkSync|rmSync)\([^;\n]*\.bytes\(\)/)
  assert.doesNotMatch(source, /fs\.readFileSync\(inox::StringView/)
  assert.doesNotMatch(source, /inox_fs_value_\d+/)
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
