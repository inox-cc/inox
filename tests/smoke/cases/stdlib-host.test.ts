// @targets c
// @expect pass
// @stdout path:/tmp/b:/tmp/file.txt
// @stdout url
// @stdout example.com
// @stdout /docs
// @stdout q=inox&kind=host
// @stdout os-process:true/true/true/true
// @stdout fs:hello:world/async
// @stdout child:child

import fs from 'node:fs'
import os, { platform } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { URL, URLSearchParams } from 'node:url'

const workspace = 'dist/test-tmp/stdlib-host-' + String(process.pid)
const syncFile = workspace + '/sync.txt'
const asyncFile = workspace + '/async.txt'
const page = new URL('/docs?q=smoke', 'https://example.com/base')
const params = new URLSearchParams({ q: 'smoke' })
params.set('q', 'inox')
params.append('kind', 'host')

fs.mkdirSync(workspace, { recursive: true })
fs.writeFileSync(syncFile, 'hello')
fs.appendFileSync(syncFile, ':world')
const syncText = fs.readFileSync(syncFile, 'utf8')

await fs.promises.writeFile(asyncFile, 'async')
const asyncText = await fs.promises.readFile(asyncFile, 'utf8')

console.log('path:' + path.join('/tmp', 'a', '..', 'b') + ':' + path.format({ dir: '/tmp', name: 'file', ext: '.txt' }))
console.log('url')
console.log(page.hostname)
console.log(page.pathname)
console.log(params.toString())
console.log('os-process:' + String(os.tmpdir().length > 0) + '/' + String(platform().length > 0) + '/' + String(process.argv.length > 0) + '/' + String(process.env.PATH.length > 0))
console.log('fs:' + syncText + '/' + asyncText)
console.log('child:' + execFileSync('/bin/echo', ['child'], { encoding: 'utf8' }).trim())

fs.unlinkSync(syncFile)
await fs.promises.unlink(asyncFile)
fs.rmSync(workspace, { recursive: true, force: true })
