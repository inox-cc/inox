import { CompileError, diagnostic } from './diagnostics.ts'
import { collectIrGlobalUsages } from './ir.ts'
import type { CompileOptions, Diagnostic, IrGlobalUsage, IrProgram, RuntimeCapabilities, SourceLocation } from './types.ts'

type RequiredCapability = {
  key: keyof RuntimeCapabilities
  name: string
}

const timerGlobals = new Set([
  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'setImmediate',
  'setInterval',
  'setTimeout'
])

export function checkCProfileCapabilities(programs: IrProgram[], options: CompileOptions): void {
  if (options.profile !== 'embedded') {
    return
  }

  const capabilities = options.capabilities ?? {}
  const diagnostics: Diagnostic[] = []
  const reported = new Set<string>()

  for (const usage of collectIrGlobalUsages(programs)) {
    const required = requiredCapabilityForGlobalUsage(usage)

    if (required == null || capabilities[required.key] === true) {
      continue
    }

    const path = usage.path.join('.')
    const key = `${required.key}:${path}:${locationKey(usage.loc)}`

    if (reported.has(key)) {
      continue
    }

    diagnostics.push(diagnostic(
      'CCJS_CAPABILITY',
      `embedded profile requires ${required.name} capability for ${path}`,
      usage.loc
    ))
    reported.add(key)
  }

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }
}

function requiredCapabilityForGlobalUsage(usage: IrGlobalUsage): RequiredCapability | null {
  const path = usage.path.join('.')

  if (path === 'Date.now') {
    return {
      key: 'wallClock',
      name: 'wall-clock'
    }
  }

  if (path === 'performance.now') {
    return {
      key: 'monotonicClock',
      name: 'monotonic-clock'
    }
  }

  if (usage.root === 'fs') {
    return {
      key: 'fs',
      name: 'filesystem'
    }
  }

  if (timerGlobals.has(path)) {
    return {
      key: 'timers',
      name: 'timers'
    }
  }

  return null
}

function locationKey(loc: SourceLocation | undefined): string {
  return `${loc?.line ?? 1}:${loc?.column ?? 1}`
}
