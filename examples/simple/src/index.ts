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

checkStringsAndMath()
checkCollections()
checkBinaryAndCrypto()
checkUrlPathOs()
await checkFs()

try {
  const foo = JSON.parse('{"v":{"1":2},{"3":4,"5":6}]}') // bad json
  console.log(foo)
} catch (e) {
  console.error('Error', e)
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
