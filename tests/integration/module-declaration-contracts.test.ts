import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkProgram } from '../../compiler/checker.ts'
import { compileGraphToIrModulesSync } from '../../compiler/core.ts'
import { tokenize } from '../../compiler/lexer.ts'
import { lowerProgram } from '../../compiler/lower.ts'
import type { MemoryCompilerSourceFile } from '../../compiler/memory-host.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import {
  createModuleDeclarationProgram,
  emitModuleDeclarationContract,
  emitModuleDeclarationContractResult,
  parseModuleDeclarationContract,
  parseModuleDeclarationContractResult
} from '../../compiler/modules/declarations.ts'
import { parse } from '../../compiler/parser.ts'
import { stdlibDeclarationExportValueType } from '../../compiler/stdlib/declarations.ts'
import type { AnyNode, Diagnostic, ProgramNode } from '../../compiler/types.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())

export function assertModuleDeclarationContracts(): void {
  assertModuleDeclarationContractRoundTrip()
  assertModuleDeclarationProgramKeepsTypeImports()
  assertModuleDeclarationContractInterfaceImportRead()
  assertModuleDeclarationContractClassSignatureRead()
  assertStdlibEntrypointDeclarations()
  assertStdlibDeclarationExportValueTypes()
  assertStdlibRuntimeImportMetadataFromDeclarations()
  assertModuleDeclarationContractDiagnostics()
}

function assertModuleDeclarationContractRoundTrip(): void {
  const declarationProgram = createDeclarationProgram(`
export type User = {
  name: string
  age?: number
}

export function userName(user: User): string {
  return user.name
}

export const version: string = '1'
export const inferred = 'ok'
`)
  const code = emitModuleDeclarationContract(declarationProgram)

  assert.match(code, /export type User = \{/)
  assert.match(code, /name: string;/)
  assert.match(code, /age\?: number;/)
  assert.match(code, /age\?: number;\n};/)
  assert.doesNotMatch(code, /\}\n;/)
  assert.match(code, /export function userName\(user: User\): string;/)
  assert.match(code, /export const version: string;/)
  assert.match(code, /export const inferred: string;/)

  const parsed = parseModuleDeclarationContract(code, 'contract.d.ts')
  const fn = findNode(parsed, 'FunctionDeclaration', 'userName')
  const variable = findNode(parsed, 'VariableDeclaration', 'version')

  assert.equal(fn.declarationOnly, true)
  assert.deepEqual(fn.body, [])
  assert.equal(variable.declarationOnly, true)
  assert.equal(variable.init, null)
}

function assertModuleDeclarationProgramKeepsTypeImports(): void {
  const parsed = parseModuleDeclarationContract(
    `
import type { ExternalUser } from './user.ts'

export type User = ExternalUser;
`,
    'source.d.ts'
  )
  const code = emitModuleDeclarationContract(createModuleDeclarationProgram(parsed))

  assert.match(code, /import type \{ ExternalUser \} from '\.\/user\.ts';/)
  assert.match(code, /export type User = ExternalUser;/)

  const withSynthetic = parseModuleDeclarationContract(
    `
import type { ExternalUser } from './user.ts'

export type User = ExternalUser;
`,
    'source.d.ts'
  )
  withSynthetic.body.push({
    type: 'TypeAliasDeclaration',
    exported: false,
    name: 'ExternalUser',
    syntheticTypeImport: true,
    syntheticTypeImportDirect: true,
    importedName: 'ExternalUser',
    valueType: {
      kind: 'alias',
      valueType: 'unknown'
    }
  })

  const syntheticCode = emitModuleDeclarationContract(createModuleDeclarationProgram(withSynthetic))

  assert.doesNotMatch(syntheticCode, /import type \{ ExternalUser \}/)
  assert.match(syntheticCode, /type ExternalUser = unknown;/)
  assert.match(syntheticCode, /export type User = ExternalUser;/)
}

function assertModuleDeclarationContractInterfaceImportRead(): void {
  const parsed = parseModuleDeclarationContract(
    `
import type { User as ExternalUser } from './user.ts'

export interface Result extends ExternalUser {
  readonly ok: boolean
  value?: string
}

export async function load(user: ExternalUser): promise<Result>;
export let current: Result;
`,
    'reader.d.ts'
  )
  const importDeclaration = parsed.body[0]
  const result = findNode(parsed, 'TypeAliasDeclaration', 'Result')
  const load = findNode(parsed, 'FunctionDeclaration', 'load')

  assert.equal(importDeclaration.type, 'ImportDeclaration')
  assert.equal(importDeclaration.typeOnly, true)
  assert.equal(result.valueType.kind, 'object')
  assert.deepEqual(result.valueType.baseTypes, ['ExternalUser'])
  assert.equal(load.async, true)
  assert.equal(load.declarationOnly, true)
  assert.equal(load.returnType, 'promise<Result>')

  const functionField = parseModuleDeclarationContract(
    'export type PathOps = { relative: (from: string, to: string) => string; }',
    'function-field.d.ts'
  )
  const pathOps = findNode(functionField, 'TypeAliasDeclaration', 'PathOps')
  const relative = pathOps.valueType.fields[0]

  assert.equal(relative.functionType.params[0].name, 'from')
  assert.equal(relative.functionType.params[1].name, 'to')
}

function assertModuleDeclarationContractClassSignatureRead(): void {
  const parsed = parseModuleDeclarationContract(
    `
export class Buffer extends Uint8Array {
  readonly length: number;

  constructor(length: number);
  static from(value: string): Buffer;
  toString(): string;
}
`,
    'class-signature.d.ts'
  )
  const buffer = findNode(parsed, 'ClassDeclaration', 'Buffer')
  const from = findClassMethod(buffer, 'from')
  const toString = findClassMethod(buffer, 'toString')

  assert.equal(buffer.extendsName, 'Uint8Array')
  assert.equal(buffer.fields[0].name, 'length')
  assert.equal(from.static, true)
  assert.equal(from.declarationOnly, true)
  assert.equal(toString.returnType, 'string')
}

function assertStdlibEntrypointDeclarations(): void {
  const files = collectStdlibEntrypointDeclarations(stdlibNodeRoot())

  assert.ok(files.length > 0, 'stdlib package entrypoint declarations should exist')

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const result = parseModuleDeclarationContractResult(source, file)

    assert.equal(result.diagnostics.length, 0, formatDeclarationDiagnostics(file, result.diagnostics))

    const exports = exportedDeclarationNames(result.program)

    assert.ok(exports.length > 0, `${file}: declaration contract should expose exports`)

    if (source.includes('export default')) {
      assert.ok(exports.includes('default'), `${file}: declaration contract should expose default export`)
    }
  }
}

function collectStdlibEntrypointDeclarations(root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name)

    if (entry.isDirectory()) {
      for (const nested of collectStdlibEntrypointDeclarations(fullPath)) {
        files.push(nested)
      }
      continue
    }

    if (entry.name === 'index.d.ts') {
      files.push(fullPath)
    }
  }

  return files.sort()
}

function exportedDeclarationNames(program: ProgramNode): string[] {
  const names: string[] = []

  for (const item of program.body) {
    if (item.exported === true && typeof item.name === 'string') {
      names.push(item.name)
    }
  }

  return names
}

function formatDeclarationDiagnostics(file: string, diagnostics: Diagnostic[]): string {
  const lines: string[] = [`${file}: declaration contract diagnostics`]

  for (const item of diagnostics) {
    lines.push(`${item.code}: ${item.message}`)
  }

  return lines.join('\n')
}

function assertStdlibDeclarationExportValueTypes(): void {
  const bufferProgram = parseStdlibEntrypointDeclaration('buffer')
  const childProcessProgram = parseStdlibEntrypointDeclaration('child_process')
  const cryptoProgram = parseStdlibEntrypointDeclaration('crypto')
  const dgramProgram = parseStdlibEntrypointDeclaration('dgram')
  const eventsProgram = parseStdlibEntrypointDeclaration('events')
  const fsProgram = parseStdlibEntrypointDeclaration('fs')
  const fsPromisesProgram = parseStdlibEntrypointDeclaration('fs/promises')
  const httpProgram = parseStdlibEntrypointDeclaration('http')
  const netProgram = parseStdlibEntrypointDeclaration('net')
  const osProgram = parseStdlibEntrypointDeclaration('os')
  const pathProgram = parseStdlibEntrypointDeclaration('path')
  const processProgram = parseStdlibEntrypointDeclaration('process')
  const streamProgram = parseStdlibEntrypointDeclaration('stream')
  const timersProgram = parseStdlibEntrypointDeclaration('timers')
  const urlProgram = parseStdlibEntrypointDeclaration('url')

  assert.equal(stdlibDeclarationExportValueType(bufferProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(bufferProgram, 'Buffer'), 'function')
  assert.equal(stdlibDeclarationExportValueType(bufferProgram, 'constants'), 'object')
  assert.equal(stdlibDeclarationExportValueType(bufferProgram, 'Uint8Array'), 'function')
  assert.equal(stdlibDeclarationExportValueType(childProcessProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(childProcessProgram, 'execSync'), 'function')
  assert.equal(stdlibDeclarationExportValueType(childProcessProgram, 'spawnSync'), 'function')
  assert.equal(stdlibDeclarationExportValueType(cryptoProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(cryptoProgram, 'createHash'), 'function')
  assert.equal(stdlibDeclarationExportValueType(cryptoProgram, 'Hash'), 'function')
  assert.equal(stdlibDeclarationExportValueType(dgramProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(dgramProgram, 'createSocket'), 'function')
  assert.equal(stdlibDeclarationExportValueType(dgramProgram, 'Socket'), 'function')
  assert.equal(stdlibDeclarationExportValueType(eventsProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(eventsProgram, 'EventEmitter'), 'function')
  assert.equal(stdlibDeclarationExportValueType(eventsProgram, 'defaultMaxListeners'), 'number')
  assert.equal(stdlibDeclarationExportValueType(eventsProgram, 'once'), 'function')
  assert.equal(stdlibDeclarationExportValueType(fsProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(fsProgram, 'constants'), 'object')
  assert.equal(stdlibDeclarationExportValueType(fsProgram, 'readFileSync'), 'function')
  assert.equal(stdlibDeclarationExportValueType(fsPromisesProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(fsPromisesProgram, 'readFile'), 'function')
  assert.equal(stdlibDeclarationExportValueType(httpProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(httpProgram, 'Server'), 'function')
  assert.equal(stdlibDeclarationExportValueType(httpProgram, 'createServer'), 'function')
  assert.equal(stdlibDeclarationExportValueType(netProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(netProgram, 'Socket'), 'function')
  assert.equal(stdlibDeclarationExportValueType(netProgram, 'connect'), 'function')
  assert.equal(stdlibDeclarationExportValueType(osProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(osProgram, 'EOL'), 'string')
  assert.equal(stdlibDeclarationExportValueType(osProgram, 'platform'), 'function')
  assert.equal(stdlibDeclarationExportValueType(pathProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(pathProgram, 'posix'), 'object')
  assert.equal(stdlibDeclarationExportValueType(pathProgram, 'join'), 'function')
  assert.equal(stdlibDeclarationExportValueType(processProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(processProgram, 'arch'), 'string')
  assert.equal(stdlibDeclarationExportValueType(processProgram, 'cwd'), 'function')
  assert.equal(stdlibDeclarationExportValueType(processProgram, 'exitCode'), 'number')
  assert.equal(stdlibDeclarationExportValueType(processProgram, 'pid'), 'number')
  assert.equal(stdlibDeclarationExportValueType(streamProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(streamProgram, 'Readable'), 'function')
  assert.equal(stdlibDeclarationExportValueType(streamProgram, 'finished'), 'function')
  assert.equal(stdlibDeclarationExportValueType(streamProgram, 'promises'), 'object')
  assert.equal(stdlibDeclarationExportValueType(timersProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(timersProgram, 'setTimeout'), 'function')
  assert.equal(stdlibDeclarationExportValueType(urlProgram, 'default'), 'object')
  assert.equal(stdlibDeclarationExportValueType(urlProgram, 'URL'), 'function')
  assert.equal(stdlibDeclarationExportValueType(urlProgram, 'fileURLToPath'), 'function')
}

function assertStdlibRuntimeImportMetadataFromDeclarations(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/project/compiler/index.ts',
        source: `
import childProcess, { execSync, spawnSync } from 'node:child_process'
import buffer, { Buffer, constants, Uint8Array } from 'node:buffer'
import crypto, { createHash, Hash, randomUUID } from 'node:crypto'
import dgram, { createSocket as createDgramSocket, Socket as DgramSocket } from 'node:dgram'
import events, { EventEmitter, defaultMaxListeners, once as eventOnce } from 'node:events'
import fs, { constants as fsConstants, promises as fsPromises, readFileSync } from 'node:fs'
import fsPromisesDefault, { readFile as readFileAsync } from 'node:fs/promises'
import http, { createServer as createHttpServer, ServerResponse } from 'node:http'
import net, { connect, Socket } from 'node:net'
import os, { EOL, platform } from 'node:os'
import path, { join, parse, posix } from 'node:path'
import process, { arch, argv, cwd, env, exitCode, pid } from 'node:process'
import stream, { Readable, finished, promises as streamPromises } from 'node:stream'
import timers, { clearTimeout, setTimeout } from 'node:timers'
import url, { fileURLToPath, pathToFileURL, URL, URLSearchParams } from 'node:url'

console.log(os.EOL)
console.log(EOL)
console.log(platform())
console.log(path.sep)
console.log(posix.sep)
console.log(join('a', 'b'))
console.log(parse('a/b.txt').base)
console.log(process.cwd())
console.log(cwd())
console.log(arch)
console.log(argv.length)
console.log(env.PATH)
console.log(exitCode)
console.log(pid)
const timer = setTimeout(() => {
  console.log('tick')
}, 1)
clearTimeout(timer)
timers.clearTimeout(timer)
const parsedUrl = new URL('file:///tmp/a.txt')
const params = new URLSearchParams('a=b')
console.log(fileURLToPath(parsedUrl))
console.log(pathToFileURL('/tmp/a.txt').href)
console.log(url.pathToFileURL('/tmp/b.txt').href)
console.log(params.get('a'))
`
      }
    ].concat(stdlibEntrypointDeclarationMemorySources()),
    {
      root: '/'
    }
  )

  const result = compileGraphToIrModulesSync('/project/compiler/index.ts', {
    host,
    loopBackend: 'libuv',
    libraries: defaultCompilerLibrarySet
  })
  const entry = result.graph.modules.find((module) => module.path === '/project/compiler/index.ts')

  assert.ok(entry !== null && typeof entry !== 'undefined')

  const childProcessImport = entry.ast.body.find(
    (item) => item.type === 'ImportDeclaration' && item.source === 'node:child_process'
  )
  const bufferImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:buffer')
  const cryptoImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:crypto')
  const dgramImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:dgram')
  const eventsImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:events')
  const fsImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:fs')
  const fsPromisesImport = entry.ast.body.find(
    (item) => item.type === 'ImportDeclaration' && item.source === 'node:fs/promises'
  )
  const httpImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:http')
  const netImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:net')
  const osImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:os')
  const pathImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:path')
  const processImport = entry.ast.body.find(
    (item) => item.type === 'ImportDeclaration' && item.source === 'node:process'
  )
  const streamImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:stream')
  const timersImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:timers')
  const urlImport = entry.ast.body.find((item) => item.type === 'ImportDeclaration' && item.source === 'node:url')
  const bufferDefault = findImportSpecifier(bufferImport, 'default')
  const bufferConstructor = findImportSpecifier(bufferImport, 'Buffer')
  const bufferConstants = findImportSpecifier(bufferImport, 'constants')
  const uint8ArrayConstructor = findImportSpecifier(bufferImport, 'Uint8Array')
  const childProcessDefault = findImportSpecifier(childProcessImport, 'default')
  const childProcessExecSync = findImportSpecifier(childProcessImport, 'execSync')
  const childProcessSpawnSync = findImportSpecifier(childProcessImport, 'spawnSync')
  const cryptoDefault = findImportSpecifier(cryptoImport, 'default')
  const cryptoCreateHash = findImportSpecifier(cryptoImport, 'createHash')
  const cryptoHashClass = findImportSpecifier(cryptoImport, 'Hash')
  const cryptoRandomUuid = findImportSpecifier(cryptoImport, 'randomUUID')
  const dgramDefault = findImportSpecifier(dgramImport, 'default')
  const dgramCreateSocket = findImportSpecifier(dgramImport, 'createSocket')
  const dgramSocketClass = findImportSpecifier(dgramImport, 'Socket')
  const eventsDefault = findImportSpecifier(eventsImport, 'default')
  const eventsEmitterClass = findImportSpecifier(eventsImport, 'EventEmitter')
  const eventsDefaultMaxListeners = findImportSpecifier(eventsImport, 'defaultMaxListeners')
  const eventsOnce = findImportSpecifier(eventsImport, 'once')
  const fsDefault = findImportSpecifier(fsImport, 'default')
  const fsConstants = findImportSpecifier(fsImport, 'constants')
  const fsPromises = findImportSpecifier(fsImport, 'promises')
  const fsReadFileSync = findImportSpecifier(fsImport, 'readFileSync')
  const fsPromisesDefault = findImportSpecifier(fsPromisesImport, 'default')
  const fsPromisesReadFile = findImportSpecifier(fsPromisesImport, 'readFile')
  const httpDefault = findImportSpecifier(httpImport, 'default')
  const httpCreateServer = findImportSpecifier(httpImport, 'createServer')
  const httpServerResponseClass = findImportSpecifier(httpImport, 'ServerResponse')
  const netDefault = findImportSpecifier(netImport, 'default')
  const netConnect = findImportSpecifier(netImport, 'connect')
  const netSocketClass = findImportSpecifier(netImport, 'Socket')
  const osDefault = findImportSpecifier(osImport, 'default')
  const osPlatform = findImportSpecifier(osImport, 'platform')
  const osEol = findImportSpecifier(osImport, 'EOL')
  const pathDefault = findImportSpecifier(pathImport, 'default')
  const pathJoin = findImportSpecifier(pathImport, 'join')
  const pathParse = findImportSpecifier(pathImport, 'parse')
  const pathPosix = findImportSpecifier(pathImport, 'posix')
  const processDefault = findImportSpecifier(processImport, 'default')
  const processArch = findImportSpecifier(processImport, 'arch')
  const processArgv = findImportSpecifier(processImport, 'argv')
  const processCwd = findImportSpecifier(processImport, 'cwd')
  const processEnv = findImportSpecifier(processImport, 'env')
  const processExitCode = findImportSpecifier(processImport, 'exitCode')
  const processPid = findImportSpecifier(processImport, 'pid')
  const streamDefault = findImportSpecifier(streamImport, 'default')
  const streamReadableClass = findImportSpecifier(streamImport, 'Readable')
  const streamFinished = findImportSpecifier(streamImport, 'finished')
  const streamPromises = findImportSpecifier(streamImport, 'promises')
  const timersDefault = findImportSpecifier(timersImport, 'default')
  const timersSetTimeout = findImportSpecifier(timersImport, 'setTimeout')
  const timersClearTimeout = findImportSpecifier(timersImport, 'clearTimeout')
  const urlDefault = findImportSpecifier(urlImport, 'default')
  const urlFileUrlToPath = findImportSpecifier(urlImport, 'fileURLToPath')
  const urlPathToFileUrl = findImportSpecifier(urlImport, 'pathToFileURL')
  const urlClass = findImportSpecifier(urlImport, 'URL')
  const urlSearchParamsClass = findImportSpecifier(urlImport, 'URLSearchParams')

  assert.equal(bufferDefault?.valueType, 'object')
  assert.equal(bufferConstructor?.valueType, 'function')
  assert.equal(bufferConstructor?.className, 'Buffer')
  assert.equal(bufferConstructor?.constructable, true)
  assert.equal(bufferConstants?.valueType, 'object')
  assert.equal(uint8ArrayConstructor?.valueType, 'function')
  assert.equal(uint8ArrayConstructor?.className, 'Uint8Array')
  assert.equal(uint8ArrayConstructor?.constructable, true)
  assert.equal(childProcessDefault?.valueType, 'object')
  assert.equal(childProcessExecSync?.valueType, 'function')
  assert.equal(childProcessExecSync?.returnType, 'string')
  assert.equal(childProcessSpawnSync?.valueType, 'function')
  assert.equal(childProcessSpawnSync?.returnType, 'SpawnSyncReturns')
  assert.equal(cryptoDefault?.valueType, 'object')
  assert.equal(cryptoCreateHash?.valueType, 'function')
  assert.equal(cryptoCreateHash?.returnType, 'Hash')
  assert.equal(cryptoHashClass?.valueType, 'function')
  assert.equal(cryptoHashClass?.className, 'Hash')
  assert.equal(cryptoHashClass?.constructable, true)
  assert.equal(cryptoRandomUuid?.returnType, 'string')
  assert.equal(dgramDefault?.valueType, 'object')
  assert.equal(dgramCreateSocket?.valueType, 'function')
  assert.equal(dgramCreateSocket?.returnType, 'Socket')
  assert.equal(dgramSocketClass?.valueType, 'function')
  assert.equal(dgramSocketClass?.className, 'Socket')
  assert.equal(dgramSocketClass?.constructable, true)
  assert.equal(eventsDefault?.valueType, 'object')
  assert.equal(eventsEmitterClass?.valueType, 'function')
  assert.equal(eventsEmitterClass?.className, 'EventEmitter')
  assert.equal(eventsEmitterClass?.constructable, true)
  assert.equal(eventsDefaultMaxListeners?.valueType, 'number')
  assert.equal(eventsOnce?.valueType, 'function')
  assert.equal(fsDefault?.valueType, 'object')
  assert.equal(fsConstants?.valueType, 'object')
  assert.equal(fsPromises?.valueType, 'object')
  assert.equal(fsReadFileSync?.valueType, 'function')
  assert.equal(fsPromisesDefault?.valueType, 'object')
  assert.equal(fsPromisesReadFile?.valueType, 'function')
  assert.equal(httpDefault?.valueType, 'object')
  assert.equal(httpCreateServer?.valueType, 'function')
  assert.equal(httpCreateServer?.returnType, 'Server')
  assert.equal(httpServerResponseClass?.valueType, 'function')
  assert.equal(httpServerResponseClass?.className, 'ServerResponse')
  assert.equal(httpServerResponseClass?.constructable, true)
  assert.equal(netDefault?.valueType, 'object')
  assert.equal(netConnect?.valueType, 'function')
  assert.equal(netConnect?.returnType, 'Socket')
  assert.equal(netSocketClass?.valueType, 'function')
  assert.equal(netSocketClass?.className, 'Socket')
  assert.equal(netSocketClass?.constructable, true)
  assert.equal(osDefault?.valueType, 'object')
  assert.equal(osPlatform?.returnType, 'string')
  assert.equal(osEol?.valueType, 'string')
  assert.equal(pathDefault?.valueType, 'object')
  assert.equal(pathJoin?.returnType, 'string')
  assert.equal(pathParse?.returnType, 'ParsedPath')
  assert.equal(pathPosix?.valueType, 'object')
  assert.equal(processDefault?.valueType, 'object')
  assert.equal(processArch?.valueType, 'string')
  assert.equal(processArgv?.valueType, 'object')
  assert.equal(processCwd?.valueType, 'function')
  assert.equal(processCwd?.returnType, 'string')
  assert.equal(processEnv?.valueType, 'object')
  assert.equal(processExitCode?.valueType, 'number')
  assert.equal(processPid?.valueType, 'number')
  assert.equal(streamDefault?.valueType, 'object')
  assert.equal(streamReadableClass?.valueType, 'function')
  assert.equal(streamReadableClass?.className, 'Readable')
  assert.equal(streamReadableClass?.constructable, true)
  assert.equal(streamFinished?.valueType, 'function')
  assert.equal(streamFinished?.returnType, 'Stream')
  assert.equal(streamPromises?.valueType, 'object')
  assert.equal(timersDefault?.valueType, 'object')
  assert.equal(timersSetTimeout?.valueType, 'function')
  assert.equal(timersSetTimeout?.returnType, 'TimeoutHandle')
  assert.equal(timersClearTimeout?.valueType, 'function')
  assert.equal(timersClearTimeout?.returnType, 'void')
  assert.equal(urlDefault?.valueType, 'object')
  assert.equal(urlFileUrlToPath?.valueType, 'function')
  assert.equal(urlFileUrlToPath?.returnType, 'string')
  assert.equal(urlPathToFileUrl?.valueType, 'function')
  assert.equal(urlPathToFileUrl?.returnType, 'URL')
  assert.equal(urlClass?.valueType, 'function')
  assert.equal(urlClass?.className, 'URL')
  assert.equal(urlClass?.constructable, true)
  assert.equal(urlSearchParamsClass?.valueType, 'function')
  assert.equal(urlSearchParamsClass?.className, 'URLSearchParams')
  assert.equal(urlSearchParamsClass?.constructable, true)
  assert.ok(
    entry.hir?.body.some((item) => item.type === 'TypeAliasDeclaration' && item.name === 'ChildProcessSyncOptions')
  )
  assert.ok(entry.hir?.body.some((item) => item.type === 'TypeAliasDeclaration' && item.name === 'SpawnSyncReturns'))
  assert.ok(entry.hir?.body.some((item) => item.type === 'TypeAliasDeclaration' && item.name === 'ParsedPath'))
  assert.ok(entry.hir?.body.some((item) => item.type === 'TypeAliasDeclaration' && item.name === 'TimeoutHandle'))
  assert.ok(entry.hir?.body.some((item) => item.type === 'TypeAliasDeclaration' && item.name === 'UrlInput'))
}

function parseStdlibEntrypointDeclaration(module: string): ProgramNode {
  const source = readStdlibEntrypointDeclarationSource(module)
  const result = parseModuleDeclarationContractResult(source, stdlibEntrypointDeclarationPath(module))

  assert.equal(result.diagnostics.length, 0, formatDeclarationDiagnostics(module, result.diagnostics))

  return result.program
}

function readStdlibEntrypointDeclarationSource(module: string): string {
  return readFileSync(stdlibEntrypointDeclarationPath(module), 'utf8')
}

function stdlibEntrypointDeclarationMemorySources(): MemoryCompilerSourceFile[] {
  const root = stdlibNodeRoot()
  const sources: MemoryCompilerSourceFile[] = []

  for (const file of collectStdlibEntrypointDeclarations(root)) {
    sources.push({
      path: `/project/stdlib/node/${relative(root, file)}`,
      source: readFileSync(file, 'utf8')
    })
  }

  return sources
}

function stdlibEntrypointDeclarationPath(module: string): string {
  return fileURLToPath(new URL(`../../stdlib/node/${module}/index.d.ts`, import.meta.url))
}

function stdlibNodeRoot(): string {
  return fileURLToPath(new URL('../../stdlib/node', import.meta.url))
}

function findImportSpecifier(importDeclaration: AnyNode | null | undefined, imported: string): AnyNode | null {
  if (importDeclaration === null || typeof importDeclaration === 'undefined') {
    return null
  }

  for (const specifier of importDeclaration.specifiers) {
    if (specifier.imported === imported) {
      return specifier
    }
  }

  return null
}

function assertModuleDeclarationContractDiagnostics(): void {
  const exportAll = parseModuleDeclarationContractResult("export * from './user.ts';", 'bad-export-all.d.ts')

  assert.equal(exportAll.diagnostics[0].code, 'INOX_DECLARATION_UNSUPPORTED_REEXPORT')

  const reexport = parseModuleDeclarationContractResult("export { value } from './user.ts';", 'bad-reexport.d.ts')

  assert.equal(reexport.diagnostics[0].code, 'INOX_DECLARATION_UNSUPPORTED_REEXPORT')

  const inferredValue = parseModuleDeclarationContractResult('export const value;', 'bad-value.d.ts')

  assert.equal(inferredValue.diagnostics[0].code, 'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED')

  const emitResult = emitModuleDeclarationContractResult({
    type: 'Program',
    body: [
      {
        type: 'VariableDeclaration',
        kind: 'const',
        exported: true,
        name: 'value',
        loc: { line: 1, column: 14 },
        init: null
      }
    ]
  })

  assert.equal(emitResult.diagnostics[0].code, 'INOX_DECLARATION_EXPLICIT_TYPE_REQUIRED')
}

function createDeclarationProgram(source: string): ProgramNode {
  const ast = parse(
    tokenize(source, {
      file: 'source.ts'
    })
  )
  const checked = checkProgram(ast, {})
  const hir = lowerProgram(checked.ast)

  return createModuleDeclarationProgram(hir)
}

function findNode(program: ProgramNode, type: string, name: string): AnyNode {
  for (const item of program.body) {
    if (item.type === type && item.name === name) {
      return item
    }
  }

  assert.fail(`missing ${type} ${name}`)
}

function findClassMethod(classDeclaration: AnyNode, name: string): AnyNode {
  for (const item of classDeclaration.methods) {
    if (item.name === name) {
      return item
    }
  }

  assert.fail(`missing class method ${name}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertModuleDeclarationContracts()
}
