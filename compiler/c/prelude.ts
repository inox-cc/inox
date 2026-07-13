import { quoteDiagnosticString } from '../diagnostics.ts'
import { emitCompilerFeatureCPreludeHelpers, emitCompilerFeatureCPreludeIncludes } from '../features/index.ts'
import type { RandomOptions } from '../types.ts'
import type { CEmitOptions } from './types.ts'

const defaultRandomSeed = 1831565813

type CRandomBackend = 'simple' | 'xorshift32' | 'os'

type CPreludeEmitOptions = {
  random?: RandomOptions | null
}

type CPreludeRandomConfig = {
  backend: CRandomBackend
  seed: number
  unsupportedBackend: string | null
}

type CPreludeRandomOptions = {
  backend?: string | null
  seed?: number | null
}

function pushCPreludeLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function pushUniqueCPreludeLine(target: string[], line: string): void {
  for (let index = 0; index < target.length; index = index + 1) {
    if (target[index] === line) {
      return
    }
  }

  target.push(line)
}

function isCSystemIncludeLine(line: string): boolean {
  return line.slice(0, 10) === '#include <'
}

function pushCPreludeInclude(systemIncludes: string[], localIncludes: string[], line: string): void {
  if (isCSystemIncludeLine(line)) {
    pushUniqueCPreludeLine(systemIncludes, line)
    return
  }

  pushUniqueCPreludeLine(localIncludes, line)
}

function pushCPreludeIncludes(systemIncludes: string[], localIncludes: string[], lines: string[]): void {
  for (let index = 0; index < lines.length; index = index + 1) {
    pushCPreludeInclude(systemIncludes, localIncludes, lines[index])
  }
}

function pushLibraryCPreludeIncludes(
  systemIncludes: string[],
  localIncludes: string[],
  includes: string[]
): void {
  for (let index = 0; index < includes.length; index = index + 1) {
    const include = includes[index]

    if (include.startsWith('#include ')) {
      pushCPreludeInclude(systemIncludes, localIncludes, include)
    } else if (include.startsWith('<')) {
      pushCPreludeInclude(systemIncludes, localIncludes, `#include ${include}`)
    } else {
      pushCPreludeInclude(systemIncludes, localIncludes, `#include "${include}"`)
    }
  }
}

function emitCPreludeIncludeLines(systemIncludes: string[], localIncludes: string[]): string[] {
  const lines: string[] = []

  pushCPreludeLines(lines, systemIncludes)
  pushCPreludeLines(lines, localIncludes)

  return lines
}

export function filterUnusedCPreludeIncludes(code: string): string {
  const lines = code.split('\n')
  const body = cPreludeFilterBody(lines)
  const filtered: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]

    if (line === '#include "inox/allocator.h"' && !cPreludeBodyUsesAllocatorHeader(body)) {
      continue
    }

    if (line === '#include "inox/string.h"' && !cPreludeBodyUsesRuntimeStringHeader(body)) {
      continue
    }

    if (line === '#include <string.h>' && !cPreludeBodyUsesCStringHeader(body)) {
      continue
    }

    if (line === '#include <stdio.h>' && !cPreludeBodyUsesCStdioHeader(body)) {
      continue
    }

    filtered.push(line)
  }

  return filtered.join('\n')
}

function cPreludeFilterBody(lines: string[]): string {
  const body: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]

    if (line.startsWith('#include ')) {
      continue
    }

    body.push(line)
  }

  return body.join('\n')
}

function cPreludeBodyUsesAllocatorHeader(body: string): boolean {
  return (
    body.includes('inox_default_allocator') ||
    body.includes('inox_allocator') ||
    body.includes('inox_default_alloc') ||
    body.includes('inox_default_realloc') ||
    body.includes('inox_default_free')
  )
}

function cPreludeBodyUsesRuntimeStringHeader(body: string): boolean {
  return body.includes('inox_string') || body.includes('INOX_REF_STRING')
}

function cPreludeBodyUsesCStringHeader(body: string): boolean {
  return (
    body.includes('strlen(') ||
    body.includes('memcpy(') ||
    body.includes('memcmp(') ||
    body.includes('memset(') ||
    body.includes('strcmp(') ||
    body.includes('strncmp(')
  )
}

function cPreludeBodyUsesCStdioHeader(body: string): boolean {
  return (
    body.includes('printf(') ||
    body.includes('fprintf(') ||
    body.includes('snprintf(') ||
    body.includes('vsnprintf(') ||
    body.includes('puts(') ||
    body.includes('fputs(') ||
    body.includes('fflush(') ||
    body.includes('FILE') ||
    body.includes('stdout') ||
    body.includes('stderr')
  )
}

function cPreludeRandomOptions(options: CEmitOptions): RandomOptions {
  const emitOptions = options as CPreludeEmitOptions
  const random = emitOptions.random

  if (random !== null && typeof random !== 'undefined') {
    return random
  }

  return {}
}

export function emitCPrelude(
  needsRuntime: boolean,
  needsMainRuntime: boolean,
  needsTimeRuntime: boolean,
  needsMathRuntime: boolean,
  needsDebugMemoryRuntime: boolean,
  needsAsyncRuntime: boolean,
  needsCallbackRuntime: boolean,
  needsClassDescriptorRuntime: boolean,
  needsCppValueRuntime: boolean,
  needsStringHeader: boolean,
  needsCollectionRuntime: boolean,
  needsMapRuntime: boolean,
  needsSetRuntime: boolean,
  needsObjectRuntime: boolean,
  needsJsonRuntime: boolean,
  needsRegexpRuntime: boolean,
  needsConsoleRuntime: boolean,
  needsFetchRuntime: boolean,
  libraryCPreludeIncludes: string[],
  options: CEmitOptions = {}
): string[] {
  const systemIncludes = ['#include <stdio.h>']
  const localIncludes: string[] = []

  if (needsConsoleRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/console.h"')
  }

  if (needsMainRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/main.h"')
  }

  if (needsCppValueRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/value.h"')
  }

  if (needsClassDescriptorRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/class_runtime.h"')
  }

  if (needsRegexpRuntime) {
    pushCPreludeIncludes(systemIncludes, localIncludes, emitCompilerFeatureCPreludeIncludes('regexp'))
  }

  if (needsDebugMemoryRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/debug.h"')
  }

  if (needsFetchRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/fetch.h"')
  }

  pushLibraryCPreludeIncludes(systemIncludes, localIncludes, libraryCPreludeIncludes)

  if (needsMathRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/math.h"')
  }

  if (needsStringHeader) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include <string.h>')
  }

  if (needsRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/allocator.h"')
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/loop.h"')
    if (needsCollectionRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/array.h"')
    }
    if (needsAsyncRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/promise.h"')
    }
    if (needsCallbackRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/callback.h"')
    }
    if (needsJsonRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/json.h"')
    }
    if (needsMapRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/map.h"')
    }
    if (needsObjectRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/object.h"')
    }
    if (needsSetRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/set.h"')
    }
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/string.h"')
  } else if (needsStringHeader) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/string.h"')
  }

  if (needsTimeRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/time.h"')
  }

  const lines = emitCPreludeIncludeLines(systemIncludes, localIncludes)

  lines.push('')

  if (needsRegexpRuntime) {
    pushCPreludeLines(lines, emitCompilerFeatureCPreludeHelpers('regexp'))
    lines.push('')
  }

  if (needsRuntime) {
    if (needsDebugMemoryRuntime) {
      lines.push('static int inox_debugMemoryAllocatorInitialized = 0;')
      lines.push('')
      lines.push('static void inox_ensure_debug_memory_allocator(void) {')
      lines.push('  if (inox_debugMemoryAllocatorInitialized) return;')
      lines.push('  inox_debugMemoryAllocatorInitialized = 1;')
      lines.push('  inox_default_allocator = inox::debugMemory.allocator(&inox_default_base_allocator);')
      lines.push('}')
      lines.push('')
    }

  }

  return lines
}

export function emitMathRuntimeInitLines(options: CEmitOptions = {}): string[] {
  const random = cPreludeRandomConfig(cPreludeRandomOptions(options))
  const randomSeed = emitRandomSeedLiteral(random)
  const randomBackend = emitRandomBackendLiteral(random.backend)

  if (random.backend === 'simple') {
    return [`Math.init(${randomSeed});`]
  }

  return [`Math.init(${randomSeed}, ${randomBackend});`]
}

function emitRandomBackendLiteral(backend: CRandomBackend): string {
  if (backend === 'xorshift32') {
    return 'MathRandomBackend::Xorshift32'
  }

  if (backend === 'os') {
    return 'MathRandomBackend::Os'
  }

  return 'MathRandomBackend::Simple'
}

function emitRandomSeedLiteral(random: CPreludeRandomConfig): string {
  const backend = random.unsupportedBackend

  if (backend !== null && typeof backend !== 'undefined') {
    throw new Error(`unsupported random backend ${quoteDiagnosticString(backend)}`)
  }

  const seed = random.seed

  if (isValidCRandomSeed(seed)) {
    return `0x${seed.toString(16).padStart(8, '0')}u`
  }

  throw new Error('random.seed must be an integer from 0 to 4294967295')
}

function cPreludeRandomConfig(random: RandomOptions): CPreludeRandomConfig {
  const options = random as CPreludeRandomOptions
  const backend = options.backend
  const seed = cPreludeRandomSeed(options)
  let randomBackend: CRandomBackend = 'simple'
  let unsupportedBackend: string | null = null

  if (backend === 'os') {
    randomBackend = 'os'
  } else if (backend === 'xorshift32') {
    randomBackend = 'xorshift32'
  } else if (backend === 'simple' || backend === null || typeof backend === 'undefined') {
    randomBackend = 'simple'
  } else {
    unsupportedBackend = backend
  }

  return {
    backend: randomBackend,
    seed,
    unsupportedBackend
  }
}

function cPreludeRandomSeed(random: CPreludeRandomOptions): number {
  const seed = random.seed

  if (seed !== null && typeof seed !== 'undefined') {
    return seed
  }

  return defaultRandomSeed
}

function isValidCRandomSeed(seed: number): boolean {
  if (seed < 0) {
    return false
  }

  if (seed > 4294967295) {
    return false
  }

  if (seed !== seed) {
    return false
  }

  return Math.floor(seed) === seed
}
