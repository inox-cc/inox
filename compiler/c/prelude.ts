import { quoteDiagnosticString } from '../diagnostics.ts'
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

function cPreludeRandomOptions(options: CEmitOptions): RandomOptions {
  const emitOptions = options as CPreludeEmitOptions
  const random = emitOptions.random

  if (random !== null && typeof random !== 'undefined') {
    return random
  }

  return {}
}

function cPreludeUsesOsRandom(random: CPreludeRandomConfig): boolean {
  return random.backend === 'os'
}

export function emitCPrelude(
  needsRuntime: boolean,
  needsTimeRuntime: boolean,
  needsMathRuntime: boolean,
  needsCryptoRuntime: boolean,
  needsDebugMemoryRuntime: boolean,
  needsAsyncRuntime: boolean,
  needsCallbackRuntime: boolean,
  needsStringHeader: boolean,
  needsCollectionRuntime: boolean,
  needsBinaryRuntime: boolean,
  needsObjectRuntime: boolean,
  needsChildProcessRuntime: boolean,
  needsFsRuntime: boolean,
  needsOsRuntime: boolean,
  needsPathRuntime: boolean,
  needsUrlRuntime: boolean,
  needsProcessRuntime: boolean,
  needsJsonRuntime: boolean,
  needsTimerRuntime: boolean,
  needsConsoleRuntime: boolean,
  needsDgramRuntime: boolean,
  needsFetchRuntime: boolean,
  needsHttpRuntime: boolean,
  needsNetRuntime: boolean,
  options: CEmitOptions = {}
): string[] {
  const lines = ['#include <stdio.h>']
  const randomOptions = cPreludeRandomOptions(options)
  const random = cPreludeRandomConfig(randomOptions)

  if (needsConsoleRuntime) {
    lines.push('#include <stdlib.h>')
    lines.push('#include "inox/console.h"')
  }

  if (needsDgramRuntime) {
    lines.push('#include "inox/dgram.h"')
  }

  if (needsDebugMemoryRuntime) {
    lines.push('#include "inox/debug.h"')
  }

  if (needsFetchRuntime) {
    lines.push('#include "inox/fetch.h"')
  }

  if (needsHttpRuntime) {
    lines.push('#include "inox/http.h"')
  }

  if (needsNetRuntime) {
    lines.push('#include "inox/net.h"')
  }

  if (needsMathRuntime || needsCryptoRuntime) {
    lines.push('#include <stdint.h>')
  }

  if (needsMathRuntime && cPreludeUsesOsRandom(random)) {
    pushCPreludeLines(lines, emitOsEntropyHeaders())
  }

  if (needsStringHeader) {
    lines.push('#include <string.h>')
  }

  if (needsRuntime) {
    if (!needsConsoleRuntime) {
      lines.push('#include <stdlib.h>')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "inox/array.h"')
      lines.push('#include "inox/hash.h"')
    }
    if (needsAsyncRuntime) {
      lines.push('#include "inox/loop.h"')
      lines.push('#include "inox/promise.h"')
    }
    if (needsCallbackRuntime) {
      lines.push('#include "inox/callback.h"')
    }
    if (needsBinaryRuntime) {
      lines.push('#include "inox/binary.h"')
    }
    if (needsChildProcessRuntime) {
      lines.push('#include "inox/child_process.h"')
    }
    if (needsCryptoRuntime) {
      lines.push('#include "inox/crypto.h"')
    }
    if (needsFsRuntime) {
      lines.push('#include "inox/fs.h"')
    }
    if (needsJsonRuntime) {
      lines.push('#include "inox/json.h"')
    }
    if (needsOsRuntime) {
      lines.push('#include "inox/os.h"')
    }
    if (needsPathRuntime) {
      lines.push('#include "inox/path.h"')
    }
    if (needsUrlRuntime) {
      lines.push('#include "inox/url.h"')
    }
    if (needsProcessRuntime) {
      lines.push('#include "inox/process.h"')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "inox/map.h"')
    }
    if (needsObjectRuntime) {
      lines.push('#include "inox/object.h"')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "inox/set.h"')
    }
    lines.push('#include "inox/string.h"')
  } else if (needsStringHeader) {
    lines.push('#include "inox/string.h"')
  }

  if (needsTimeRuntime) {
    lines.push('#include "inox/time.h"')
  }

  lines.push('')

  if (needsMathRuntime && cPreludeUsesOsRandom(random)) {
    pushCPreludeLines(lines, emitOsEntropyHelper())
    lines.push('')
  }

  if (needsMathRuntime) {
    pushCPreludeLines(lines, emitMathHelpers(random))
    lines.push('')
  }

  if (needsRuntime) {
    lines.push('static void* inox_default_alloc(void* user, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)align;')
    lines.push('  return calloc(1, size);')
    lines.push('}')
    lines.push('')
    lines.push(
      'static void* inox_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {'
    )
    lines.push('  (void)user;')
    lines.push('  (void)old_size;')
    lines.push('  (void)align;')
    lines.push('  return realloc(ptr, new_size);')
    lines.push('}')
    lines.push('')
    lines.push('static void inox_default_free(void* user, void* ptr, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)size;')
    lines.push('  (void)align;')
    lines.push('  free(ptr);')
    lines.push('}')
    lines.push('')
    if (needsDebugMemoryRuntime) {
      lines.push('static inox_allocator inox_default_base_allocator = {')
      lines.push('  0,')
      lines.push('  inox_default_alloc,')
      lines.push('  inox_default_realloc,')
      lines.push('  inox_default_free')
      lines.push('};')
      lines.push('')
    }
    lines.push('static inox_allocator inox_default_allocator = {')
    lines.push('  0,')
    lines.push('  inox_default_alloc,')
    lines.push('  inox_default_realloc,')
    lines.push('  inox_default_free')
    lines.push('};')
    lines.push('')

    if (needsDebugMemoryRuntime) {
      lines.push('static int inox_debug_memory_allocator_initialized = 0;')
      lines.push('')
      lines.push('static void inox_debug_memory_ensure_allocator(void) {')
      lines.push('  if (inox_debug_memory_allocator_initialized) return;')
      lines.push('  inox_debug_memory_allocator_initialized = 1;')
      lines.push('  inox_default_allocator = inox_debug_allocator(&inox_default_base_allocator);')
      lines.push('}')
      lines.push('')
    }

    if (needsTimerRuntime) {
      lines.push('static inox_status inox_timer_callback_run(void* context) {')
      lines.push('  if (context == 0) return INOX_ERR_TYPE;')
      lines.push('  inox_value* callback = (inox_value*)context;')
      lines.push('  inox_value result = inox_undefined_value();')
      lines.push('  inox_status status = inox_callback_call(*callback, 0, 0, &result);')
      lines.push('  inox_release(result);')
      lines.push('  return status;')
      lines.push('}')
      lines.push('')
      lines.push('static void inox_timer_callback_finalize(void* context) {')
      lines.push('  if (context == 0) return;')
      lines.push('  inox_value* callback = (inox_value*)context;')
      lines.push('  inox_release(*callback);')
      lines.push('  inox_default_free(0, context, sizeof(inox_value), _Alignof(inox_value));')
      lines.push('}')
      lines.push('')
    }
  }

  return lines
}

function emitMathHelpers(random: CPreludeRandomConfig): string[] {
  const randomSeed = emitRandomSeedLiteral(random)
  const randomBackend = random.backend
  const lines: string[] = []

  lines.push('static double inox_math_abs(double value) {')
  lines.push('  return value < 0 ? -value : value;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_floor(double value) {')
  lines.push('  long long truncated = (long long)value;')
  lines.push('  return (double)truncated > value ? (double)(truncated - 1) : (double)truncated;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_ceil(double value) {')
  lines.push('  long long truncated = (long long)value;')
  lines.push('  return (double)truncated < value ? (double)(truncated + 1) : (double)truncated;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_round(double value) {')
  lines.push('  return inox_math_floor(value + 0.5);')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_trunc(double value) {')
  lines.push('  return (double)((long long)value);')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_fround(double value) {')
  lines.push('  return (double)((float)value);')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_min(double left, double right) {')
  lines.push('  return left < right ? left : right;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_max(double left, double right) {')
  lines.push('  return left > right ? left : right;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_sqrt(double value) {')
  lines.push('  if (value < 0) return 0.0/0.0;')
  lines.push('  if (value == 0) return 0;')
  lines.push('  double estimate = value < 1 ? 1 : value;')
  lines.push('  for (int index = 0; index < 24; index += 1) {')
  lines.push('    estimate = 0.5 * (estimate + value/estimate);')
  lines.push('  }')
  lines.push('  return estimate;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_reduce_radians(double value) {')
  lines.push('  const double pi = 3.14159265358979323846;')
  lines.push('  const double tau = 6.28318530717958647692;')
  lines.push('  while (value > pi) value -= tau;')
  lines.push('  while (value < -pi) value += tau;')
  lines.push('  return value;')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_sin(double value) {')
  lines.push('  double x = inox_math_reduce_radians(value);')
  lines.push('  double x2 = x * x;')
  lines.push('  return x * (1 - x2/6 + (x2 * x2)/120 - (x2 * x2 * x2)/5040 + (x2 * x2 * x2 * x2)/362880);')
  lines.push('}')
  lines.push('')
  lines.push('static double inox_math_cos(double value) {')
  lines.push('  double x = inox_math_reduce_radians(value);')
  lines.push('  double x2 = x * x;')
  lines.push('  return 1 - x2/2 + (x2 * x2)/24 - (x2 * x2 * x2)/720 + (x2 * x2 * x2 * x2)/40320;')
  lines.push('}')
  lines.push('')
  lines.push(`static uint32_t inox_math_random_state = ${randomSeed};`)
  lines.push('')
  pushCPreludeLines(lines, emitRandomBackendHelper(randomBackend))

  return lines
}

function emitOsEntropyHeaders(): string[] {
  return [
    '#if defined(_WIN32) && defined(_MSC_VER)',
    '#define _CRT_RAND_S',
    '#endif',
    '#if defined(_WIN32)',
    '#include <stdlib.h>',
    '#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__) || defined(__DragonFly__)',
    '#include <stdlib.h>',
    '#else',
    '#include <fcntl.h>',
    '#include <unistd.h>',
    '#if defined(__linux__)',
    '#include <sys/random.h>',
    '#endif',
    '#endif'
  ]
}

function emitOsEntropyHelper(): string[] {
  return [
    'static int inox_os_random_bytes(uint8_t* out, size_t len) {',
    '  if (out == 0 && len != 0) return 0;',
    '#if defined(_WIN32) && defined(_MSC_VER)',
    '  size_t filled = 0;',
    '  while (filled < len) {',
    '    unsigned int value = 0;',
    '    if (rand_s(&value) != 0) return 0;',
    '    for (size_t index = 0; index < sizeof(value) && filled < len; index += 1) {',
    '      out[filled] = (uint8_t)(value >> (index * 8));',
    '      filled += 1;',
    '    }',
    '  }',
    '  return 1;',
    '#elif defined(_WIN32)',
    '  (void)out;',
    '  (void)len;',
    '  return 0;',
    '#elif defined(__APPLE__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__) || defined(__DragonFly__)',
    '  arc4random_buf(out, len);',
    '  return 1;',
    '#else',
    '  size_t filled = 0;',
    '#if defined(__linux__)',
    '  while (filled < len) {',
    '    ssize_t count = getrandom(out + filled, len - filled, 0);',
    '    if (count <= 0) break;',
    '    filled += (size_t)count;',
    '  }',
    '  if (filled == len) return 1;',
    '#endif',
    '  int fd = open("/dev/urandom", O_RDONLY);',
    '  if (fd < 0) return 0;',
    '  while (filled < len) {',
    '    ssize_t count = read(fd, out + filled, len - filled);',
    '    if (count <= 0) {',
    '      close(fd);',
    '      return 0;',
    '    }',
    '    filled += (size_t)count;',
    '  }',
    '  close(fd);',
    '  return 1;',
    '#endif',
    '}'
  ]
}

function emitRandomBackendHelper(backend: CRandomBackend): string[] {
  if (backend === 'os') {
    return [
      'static double inox_math_random(void) {',
      '  uint32_t value = 0;',
      '  if (!inox_os_random_bytes((uint8_t*)&value, sizeof(value))) {',
      '    inox_math_random_state = inox_math_random_state * 1664525u + 1013904223u;',
      '    value = inox_math_random_state;',
      '  }',
      '  return (double)(value >> 8) / 16777216.0;',
      '}'
    ]
  }

  if (backend === 'xorshift32') {
    return [
      'static double inox_math_random(void) {',
      '  if (inox_math_random_state == 0u) inox_math_random_state = 0x6d2b79f5u;',
      '  uint32_t value = inox_math_random_state;',
      '  value ^= value << 13;',
      '  value ^= value >> 17;',
      '  value ^= value << 5;',
      '  inox_math_random_state = value;',
      '  return (double)(value >> 8) / 16777216.0;',
      '}'
    ]
  }

  return [
    'static double inox_math_random(void) {',
    '  inox_math_random_state = inox_math_random_state * 1664525u + 1013904223u;',
    '  return (double)(inox_math_random_state >> 8) / 16777216.0;',
    '}'
  ]
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
