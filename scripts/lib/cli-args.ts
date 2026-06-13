import { basename, dirname, extname, join } from 'node:path'

const commands = new Set(['build', 'run', 'test'])
const emitTargets = new Set(['c'])

export type CliTarget = 'c'

export type CliCommand = 'build' | 'emit' | 'help' | 'run' | 'test'

export type CliPlan = {
  command: CliCommand
  entry?: string | null
  emit?: CliTarget | null
  target?: CliTarget | null
  out?: string | null
  keep?: boolean
  help?: boolean
}

type CliOptions = {
  emit?: CliTarget
  target?: CliTarget
  out?: string
  keep?: boolean
}

type ParsedOptions = {
  positionals: string[]
  options: CliOptions
}

type ParseResult<T> = {
  ok: true
  plan: T
  value: T
} | {
  ok: false
  error: string
}

export const usage = `Usage:
  ccjs <entry>
  ccjs <entry> --emit c [-o output.c]
  ccjs run <entry> [--target c] [--keep]
  ccjs build <entry> --target c [-o executable]
  ccjs test

Examples:
  ccjs index.ts
  ccjs index.ts --emit c
  ccjs index.ts --emit c -o build/index.c
  ccjs run src/main.ts
  ccjs build src/main.ts --target c -o build/main`

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
  const out = options.out ?? (emit == null ? null : defaultEmitOutput(entry, emit))
  const finalCommand: CliCommand = emit == null ? command : 'emit'

  if (command === 'build' && target == null) {
    return fail('build requires --target c')
  }

  return ok({
    command: finalCommand,
    entry,
    emit,
    target,
    out,
    keep: options.keep ?? false
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
    `keep: ${plan.keep ? 'yes' : 'no'}`
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

function isCliCommand(value: string | undefined): value is CliCommand {
  return value != null && commands.has(value)
}
