import { basename, dirname, extname, join } from 'node:path'

const commands = new Set(['build', 'run', 'test'])
const emitTargets = new Set(['c'])
const loopBackends = new Set(['embedded', 'libuv'])
const tlsBackends = new Set(['none', 'boringssl', 'openssl'])

export type CliTarget = 'c'
export type CliLoopBackend = 'embedded' | 'libuv'
export type CliTlsBackend = 'none' | 'boringssl' | 'openssl'

export type CliCommand = 'build' | 'emit' | 'help' | 'run' | 'test'

export type CliPlan = {
  command: CliCommand
  entry?: string | null
  emit?: CliTarget | null
  target?: CliTarget | null
  out?: string | null
  outDir?: string | null
  entryMode?: boolean
  keep?: boolean
  loopBackend?: CliLoopBackend | null
  tlsBackend?: CliTlsBackend | null
  help?: boolean
}

type CliOptions = {
  emit?: CliTarget
  target?: CliTarget
  out?: string
  outDir?: string
  entryMode?: boolean
  keep?: boolean
  loopBackend?: CliLoopBackend
  tlsBackend?: CliTlsBackend
}

type ParsedOptions = {
  positionals: string[]
  options: CliOptions
}

type ParseResult<T> =
  | {
      ok: true
      plan: T
      value: T
    }
  | {
      ok: false
      error: string
    }

export const usage = `Usage:
  inox <entry>
  inox <entry> --emit c [-o output.c] [--loop-backend embedded|libuv] [--tls-backend none|boringssl|openssl]
  inox <entry> --emit c --out-dir generated --entry [--loop-backend embedded|libuv] [--tls-backend none|boringssl|openssl]
  inox run <entry> [--target c] [--keep] [--loop-backend embedded|libuv] [--tls-backend none|boringssl|openssl]
  inox build <entry> --target c [-o executable] [--loop-backend embedded|libuv] [--tls-backend none|boringssl|openssl]
  inox test

Examples:
  inox index.ts
  inox index.ts --emit c
  inox index.ts --emit c -o build/index.c
  inox src/index.ts --emit c --out-dir generated --entry
  inox run src/main.ts
  inox build src/main.ts --target c -o build/main

The old ccjs command remains available as a compatibility alias.`

export function parseCliArgs(args: string[]): ParseResult<CliPlan> {
  if (args.length === 0) {
    return ok({
      command: 'help',
      help: true
    })
  }

  if (args.includes('--help') || args.includes('-h')) {
    return ok({
      command: 'help',
      help: true
    })
  }

  const [first, ...rest] = args

  if (first === 'test') {
    return ok({
      command: 'test',
      entry: null,
      emit: null,
      target: null,
      out: null,
      outDir: null,
      entryMode: false,
      keep: false
    })
  }

  const firstIsCommand = isCliCommand(first)
  const command: CliCommand = firstIsCommand ? first : 'run'
  const tokens = firstIsCommand ? rest : args
  const parsed = parseOptions(tokens)

  if (!parsed.ok) {
    return parsed
  }

  const { positionals, options } = parsed.value

  if (positionals.length === 0) {
    return fail(`${command} requires an entry file`)
  }

  if (positionals.length > 1) {
    return fail(`unexpected positional arguments: ${positionals.slice(1).join(', ')}`)
  }

  const entry = positionals[0]
  const emit = options.emit ?? null
  const target = options.target ?? emit ?? null
  const outDir = options.outDir ?? null
  const entryMode = options.entryMode ?? false
  const out = options.out ?? (emit == null || outDir != null ? null : defaultEmitOutput(entry, emit))
  const finalCommand: CliCommand = emit == null ? command : 'emit'
  const loopBackend = options.loopBackend ?? null
  const tlsBackend = options.tlsBackend ?? null

  if (command === 'build' && target == null) {
    return fail('build requires --target c')
  }

  if (options.out != null && outDir != null) {
    return fail('use either -o/--out or --out-dir')
  }

  if (outDir != null && emit !== 'c') {
    return fail('--out-dir requires --emit c')
  }

  if (outDir != null && !entryMode) {
    return fail('--out-dir requires --entry')
  }

  if (entryMode && outDir == null) {
    return fail('--entry requires --out-dir')
  }

  return ok({
    command: finalCommand,
    entry,
    emit,
    target,
    out,
    outDir,
    entryMode,
    keep: options.keep ?? false,
    loopBackend,
    tlsBackend
  })
}

export function defaultEmitOutput(entry: string, emit: CliTarget): string {
  const dir = dirname(entry)
  const ext = extname(entry)
  const base = basename(entry, ext)
  const outputExt = `.${emit}`
  const file = ext === outputExt ? `${base}.out${outputExt}` : `${base}.${emit}`

  return dir === '.' ? file : join(dir, file)
}

export function formatCliPlan(plan: CliPlan): string {
  const lines = [
    `command: ${plan.command}`,
    `entry: ${plan.entry ?? '-'}`,
    `target: ${plan.target ?? '-'}`,
    `emit: ${plan.emit ?? '-'}`,
    `out: ${plan.out ?? '-'}`,
    `outDir: ${plan.outDir ?? '-'}`,
    `entryMode: ${plan.entryMode ? 'yes' : 'no'}`,
    `keep: ${plan.keep ? 'yes' : 'no'}`,
    `loopBackend: ${plan.loopBackend ?? '-'}`,
    `tlsBackend: ${plan.tlsBackend ?? '-'}`
  ]

  return lines.join('\n')
}

function parseOptions(tokens: string[]): ParseResult<ParsedOptions> {
  const positionals: string[] = []
  const options: CliOptions = {}

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]

    if (token === '--keep') {
      options.keep = true
    } else if (token === '--emit') {
      const value = tokens[i + 1]
      i += 1

      if (!isCliTarget(value)) {
        return fail('--emit expects c')
      }

      options.emit = value
    } else if (token === '--target') {
      const value = tokens[i + 1]
      i += 1

      if (!isCliTarget(value)) {
        return fail('--target expects c')
      }

      options.target = value
    } else if (token === '-o' || token === '--out') {
      const value = tokens[i + 1]
      i += 1

      if (value == null || value.startsWith('-')) {
        return fail(`${token} expects a path`)
      }

      options.out = value
    } else if (token === '--out-dir') {
      const value = tokens[i + 1]
      i += 1

      if (value == null || value.startsWith('-')) {
        return fail(`${token} expects a path`)
      }

      options.outDir = value
    } else if (token === '--entry') {
      options.entryMode = true
    } else if (token === '--loop-backend') {
      const value = tokens[i + 1]
      i += 1

      if (!isCliLoopBackend(value)) {
        return fail('--loop-backend expects embedded or libuv')
      }

      options.loopBackend = value
    } else if (token === '--tls-backend') {
      const value = tokens[i + 1]
      i += 1

      if (!isCliTlsBackend(value)) {
        return fail('--tls-backend expects none, boringssl or openssl')
      }

      options.tlsBackend = value
    } else if (token.startsWith('-')) {
      return fail(`unknown option ${token}`)
    } else {
      positionals.push(token)
    }
  }

  return ok({
    positionals,
    options
  })
}

function ok<T>(value: T): ParseResult<T> {
  return {
    ok: true,
    plan: value,
    value
  }
}

function fail(error: string): ParseResult<never> {
  return {
    ok: false,
    error
  }
}

function isCliTarget(value: string | undefined): value is CliTarget {
  return value != null && emitTargets.has(value)
}

function isCliLoopBackend(value: string | undefined): value is CliLoopBackend {
  return value != null && loopBackends.has(value)
}

function isCliTlsBackend(value: string | undefined): value is CliTlsBackend {
  return value != null && tlsBackends.has(value)
}

function isCliCommand(value: string | undefined): value is CliCommand {
  return value != null && commands.has(value)
}
