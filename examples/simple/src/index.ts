import { Buffer, constants as bufferConstants } from 'node:buffer'
import fs from 'node:fs'
import os, { platform } from 'node:os'
import path from 'node:path'
import { URL, URLSearchParams } from 'node:url'

console.log('hello world')
const v = 123
console.log(`num ${v} блаблабла`)
console.log('date', Date.now())
console.log('performance', performance.now())
console.log('process.version', process.version)
console.log('process.versions', process.versions)
console.log('process', process)

type CompilerExampleItem = {
  value: string
}

type CompilerExampleOptions = {
  value: number
}

type CompilerExampleOperation = (value: number) => number

type CompilerExampleOperations = {
  apply: CompilerExampleOperation
}

function firstCompilerExampleValue(items: CompilerExampleItem[]): string {
  if (items.length === 0) {
    return 'empty'
  }

  return items[0].value
}

function checkCompilerStageOne() {
  const options: CompilerExampleOptions = {
    value: true ? 7 : 9
  }
  const values: number[] = [false ? 7 : 9]
  const operations: CompilerExampleOperations = {
    apply: (value: number) => value + 1
  }
  const parsed: unknown = JSON.parse('7')

  console.log(
    'compiler stage 1',
    firstCompilerExampleValue([]),
    options.value,
    values[0],
    operations.apply(2),
    JSON.stringify(parsed)
  )
}

type CompilerExampleCollections = {
  names: Map<string, string>
  tags: Set<string>
}

type CompilerExampleConfig = {
  name: string
  count?: number
}

type CompilerExampleLeftA = { a: number }
type CompilerExampleLeftB = { b: number }
type CompilerExampleLeft = CompilerExampleLeftA | CompilerExampleLeftB

type CompilerExampleRightX = { value: boolean; x: number }
type CompilerExampleRightY = { value: number; y: number }
type CompilerExampleRight = CompilerExampleRightX | CompilerExampleRightY

type CompilerExampleCombinedAY = { a: number; value: number; y: number }
type CompilerExampleCombinedAX = { a: number; value: boolean; x: number }
type CompilerExampleCombinedBY = { b: number; value: number; y: number }
type CompilerExampleCombinedBX = { b: number; value: boolean; x: number }
type CompilerExampleCombined =
  CompilerExampleCombinedAY | CompilerExampleCombinedAX | CompilerExampleCombinedBY | CompilerExampleCombinedBX

function inferredCompilerExampleValue(flag: boolean) {
  const fallback = 9

  if (flag) {
    return 7
  }

  return fallback
}

async function inferredCompilerExampleAsyncValue(flag: boolean) {
  const fallback = 11

  if (flag) {
    return 10
  }

  return fallback
}

function laterCompilerExampleStatus(): string {
  return compilerExampleSettings.status
}

function firstCompilerExampleSize(values: Array<{ size: number } | null>): number {
  for (const value of values) {
    if (value !== null) {
      return value.size
    }
  }

  return 0
}

function readCompilerExampleCollections(contexts: CompilerExampleCollections[]): string {
  if (contexts.length === 0) {
    return 'missing'
  }

  const first = contexts[0]
  const names: Map<string, string> = first.names

  for (const context of contexts) {
    const tags: Set<string> = context.tags

    if (tags.has('typed')) {
      return names.get('item') ?? 'missing'
    }
  }

  return 'missing'
}

function combineCompilerExampleValues(left: CompilerExampleLeft, right: CompilerExampleRight): CompilerExampleCombined {
  const combined: CompilerExampleCombined = { ...left, ...right }
  return combined
}

async function checkCompilerStageTwo() {
  const config: CompilerExampleConfig = { name: 'inox' }
  config.count = 2

  const names: Map<string, string> = new Map()
  const tags: Set<string> = new Set()
  names.set('item', 'typed collections')
  tags.add('typed')

  const collections: CompilerExampleCollections[] = [{ names, tags }]

  combineCompilerExampleValues({ a: 1 }, { value: true, x: 2 })

  console.log(
    'compiler stage 2',
    inferredCompilerExampleValue(true),
    inferredCompilerExampleValue(false),
    await inferredCompilerExampleAsyncValue(true),
    laterCompilerExampleStatus(),
    firstCompilerExampleSize([null, { size: 12 }]),
    config.count
  )
  console.log('compiler stage 2 native types', readCompilerExampleCollections(collections))
}

const compilerExampleSettings = { status: 'ready' }

function checkStringsAndMath() {
  const trimmed = '  Inox stdlib  '.trim()
  const parts = 'alpha,beta,gamma'.split(',')
  const regexp = /stdlib/i

  console.log('strings', trimmed.toUpperCase(), trimmed.slice(0, 4), parts.join('|'))
  console.log(
    'string predicates',
    trimmed.includes('std'),
    trimmed.startsWith('In'),
    trimmed.endsWith('lib'),
    regexp.test(trimmed)
  )
  console.log('string indexes', trimmed.indexOf('o'), trimmed.lastIndexOf('i'))
  console.log('math', Math.min(2, v), Math.max(7, v), Math.round(2.6), Math.trunc(2.9), Math.sqrt(81))
}

function checkCollections() {
  const names = ['Ada', 'Grace']
  names.push('Linus')
  names.unshift('Edsger')

  console.log('array', names.join(','))
  console.log('array includes', names.includes('Grace'), names.slice(1, 3).join('/'), names.pop() ?? 'none')

  const versions: Map<string, string> = new Map()
  versions.set('compiler', 'ts')
  versions.set('runtime', 'cpp')

  console.log('map', versions.get('compiler') ?? 'missing', versions.has('runtime'), versions.size)

  const features: Set<string> = new Set()
  features.add('fetch')
  features.add('json')
  features.add('fs')

  console.log('set', features.has('json'), features.size)
}

function checkBinaryAndCrypto() {
  const text = Buffer.from('inox')
  const allocated = Buffer.alloc(2)
  allocated[0] = 65
  allocated[1] = 66

  const random = new Uint8Array(4)
  const same = crypto.getRandomValues(random)

  console.log('buffer', text.toString(), allocated.toString(), Buffer.isBuffer(text), bufferConstants.MAX_LENGTH > 0)
  console.log('uint8', same.length, random[0] >= 0)
}

function checkUrlPathOs() {
  const page = new URL('/docs?q=smoke', 'https://example.com/base')
  const params = new URLSearchParams({ q: 'smoke' })
  params.set('q', 'inox')
  params.append('kind', 'simple')

  console.log('url', page.hostname, page.pathname, params.toString())
  console.log('path', path.join('/tmp', 'a', '..', 'b'), path.format({ dir: '/tmp', name: 'file', ext: '.txt' }))
  console.log('os', os.tmpdir().length > 0, platform().length > 0)
}

async function checkFs() {
  const workspace = 'dist/examples/simple/runtime-' + String(process.pid)
  const syncFile = workspace + '/sync.txt'
  const asyncFile = workspace + '/async.txt'

  fs.mkdirSync(workspace, { recursive: true })
  fs.writeFileSync(syncFile, 'hello')
  fs.appendFileSync(syncFile, ':sync')

  await fs.promises.writeFile(asyncFile, 'hello')
  await fs.promises.appendFile(asyncFile, ':async')

  console.log('fs sync', fs.readFileSync(syncFile, 'utf8'))
  console.log('fs async', await fs.promises.readFile(asyncFile, 'utf8'))

  fs.unlinkSync(syncFile)
  await fs.promises.unlink(asyncFile)
  fs.rmSync(workspace, { recursive: true, force: true })
}

async function checkFetch() {
  try {
    const res = await fetch('http://example.com/')
    console.log('Status', res.status)
    const txt = await res.text()
    console.log('Text', txt)
  } catch (error) {
    console.error('#error:', error)
  }
}

checkCompilerStageOne()
await checkCompilerStageTwo()
checkStringsAndMath()
checkCollections()
checkBinaryAndCrypto()
checkUrlPathOs()
await checkFs()

try {
  const foo = JSON.parse('{"v":{"1":2},{"3":4,"5":6}]}') // bad json
  console.log(foo)
} catch (e) {
  console.error('Test error:', e)
}

const foo = JSON.parse('{"v":[{"1":2},{"3":4,"5":"блаблабла"}]}')

console.log(Array.isArray(foo))

console.log(Object.entries(foo.v))

for (const a of foo.v) {
  console.log(a)

  const b = Object.values(a)
  console.log(b)

  const c = Object.values(a)[0]
  console.log(c)

  const d = Object.entries(a)
  console.log(d)

  const e = Object.entries(a)[0]
  console.log(e)
}

await checkFetch()

class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test() {
    console.log(this.name)
  }
}

const f = new Foo('foo 1 ололо')
f.test()
