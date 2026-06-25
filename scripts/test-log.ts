import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { rootDir } from './lib/repo-root.ts'

type ParsedArgs = {
  logFile: string
  command: string
  args: string[]
}

const ansiEscapePattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const ansiEscapeAtStartPattern = /^\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/
const incompleteAnsiEscapePattern = /^\x1B(?:\[[0-?]*[ -/]*)?$/

const parsed = parseArgs(process.argv.slice(2))

if (parsed === null) {
  console.error('Usage: node scripts/test-log.ts dist/test.log -- command [...args]')
  process.exit(1)
}

await runWithLog(parsed)

async function runWithLog(options: ParsedArgs): Promise<void> {
  const logPath = resolve(rootDir, options.logFile)
  const relativeLogPath = relative(rootDir, logPath)

  if (relativeLogPath.startsWith('..') || relativeLogPath === '' || !relativeLogPath.startsWith('dist/')) {
    console.error('test log must be written inside dist')
    process.exit(1)
  }

  await mkdir(dirname(logPath), {
    recursive: true
  })

  const log = createWriteStream(logPath, {
    flags: 'w'
  })
  const started = new Date()

  log.write(`# inox test log\n`)
  log.write(`# started: ${started.toISOString()}\n`)
  log.write(`# command: ${formatCommand([options.command, ...options.args])}\n\n`)
  let pendingLogText = ''

  const child = spawn(options.command, options.args, {
    cwd: rootDir,
    env: testLogEnv(),
    stdio: ['inherit', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk)
    pendingLogText = writePlainLogChunk(log, pendingLogText, chunk)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk)
    pendingLogText = writePlainLogChunk(log, pendingLogText, chunk)
  })

  const forwardSignal = (signal: NodeJS.Signals): void => {
    child.kill(signal)
  }

  process.once('SIGINT', forwardSignal)
  process.once('SIGTERM', forwardSignal)

  const code = await new Promise<number>((resolveCode) => {
    child.on('error', (error) => {
      const message = `${error.message}\n`
      process.stderr.write(message)
      pendingLogText = flushPlainLogText(log, pendingLogText)
      log.write(message)
      resolveCode(127)
    })
    child.on('close', (childCode) => {
      resolveCode(childCode ?? 1)
    })
  })

  process.removeListener('SIGINT', forwardSignal)
  process.removeListener('SIGTERM', forwardSignal)

  pendingLogText = flushPlainLogText(log, pendingLogText)
  log.write(`\n# finished: ${new Date().toISOString()}\n`)
  log.write(`# exit code: ${code}\n`)

  await new Promise<void>((resolveEnd) => {
    log.end(resolveEnd)
  })

  process.exitCode = code
}

function writePlainLogChunk(log: NodeJS.WritableStream, pending: string, chunk: Buffer): string {
  const text = pending + chunk.toString('utf8')
  const pendingLength = incompleteAnsiEscapeSuffixLength(text)
  const complete = pendingLength === 0 ? text : text.slice(0, text.length - pendingLength)

  if (complete.length > 0) {
    log.write(stripAnsi(complete))
  }

  if (pendingLength === 0) {
    return ''
  }

  return text.slice(text.length - pendingLength)
}

function flushPlainLogText(log: NodeJS.WritableStream, pending: string): string {
  if (pending.length > 0) {
    log.write(stripAnsi(pending))
  }

  return ''
}

function stripAnsi(value: string): string {
  return value.replace(ansiEscapePattern, '')
}

function incompleteAnsiEscapeSuffixLength(value: string): number {
  const escapeIndex = value.lastIndexOf('\x1B')

  if (escapeIndex === -1) {
    return 0
  }

  const suffix = value.slice(escapeIndex)

  if (ansiEscapeAtStartPattern.test(suffix)) {
    return 0
  }

  if (incompleteAnsiEscapePattern.test(suffix)) {
    return suffix.length
  }

  return 0
}

function parseArgs(args: string[]): ParsedArgs | null {
  const separator = args.indexOf('--')

  if (separator <= 0 || separator === args.length - 1) {
    return null
  }

  return {
    logFile: args[0],
    command: args[separator + 1],
    args: args.slice(separator + 2)
  }
}

function testLogEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: process.env.FORCE_COLOR ?? '1'
  }

  delete env.NO_COLOR

  return env
}

function formatCommand(parts: string[]): string {
  const formatted: string[] = []

  for (const part of parts) {
    formatted.push(formatCommandPart(part))
  }

  return formatted.join(' ')
}

function formatCommandPart(part: string): string {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(part)) {
    return part
  }

  return `'${part.replaceAll("'", "'\\''")}'`
}
