import type { RandomOptions } from '../types.ts'
import type { CEmitOptions } from './types.ts'

const defaultRandomSeed = 0x6d2b79f5

export function emitCPrelude(
  needsRuntime,
  needsTimeRuntime,
  needsMathRuntime,
  needsCryptoRuntime,
  needsDebugMemoryRuntime,
  needsAsyncRuntime,
  needsCallbackRuntime,
  needsStringHeader,
  needsCollectionRuntime,
  needsBinaryRuntime,
  needsObjectRuntime,
  needsFsRuntime,
  needsJsonRuntime,
  needsTimerRuntime,
  needsConsoleRuntime,
  needsDgramRuntime,
  needsFetchRuntime,
  needsHttpRuntime,
  needsNetRuntime,
  options: CEmitOptions = {}
) {
  const lines = ['#include <stdio.h>']

  if (needsConsoleRuntime) {
    lines.push('#include <stdlib.h>')
    lines.push('#include "ccjs/console.h"')
  }

  if (needsDgramRuntime) {
    lines.push('#include "ccjs/dgram.h"')
  }

  if (needsDebugMemoryRuntime) {
    lines.push('#include "ccjs/debug.h"')
  }

  if (needsFetchRuntime) {
    lines.push('#include "ccjs/fetch.h"')
  }

  if (needsHttpRuntime) {
    lines.push('#include "ccjs/http.h"')
  }

  if (needsNetRuntime) {
    lines.push('#include "ccjs/net.h"')
  }

  if (needsMathRuntime || needsCryptoRuntime) {
    lines.push('#include <stdint.h>')
  }

  if (needsCryptoRuntime || (needsMathRuntime && (options.random?.backend ?? 'simple') === 'os')) {
    lines.push(...emitOsEntropyHeaders())
  }

  if (needsStringHeader) {
    lines.push('#include <string.h>')
  }

  if (needsRuntime) {
    if (!needsConsoleRuntime) {
      lines.push('#include <stdlib.h>')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "ccjs/array.h"')
    }
    if (needsAsyncRuntime) {
      lines.push('#include "ccjs/loop.h"')
      lines.push('#include "ccjs/promise.h"')
    }
    if (needsCallbackRuntime) {
      lines.push('#include "ccjs/callback.h"')
    }
    if (needsBinaryRuntime) {
      lines.push('#include "ccjs/binary.h"')
    }
    if (needsFsRuntime) {
      lines.push('#include "ccjs/fs.h"')
    }
    if (needsJsonRuntime) {
      lines.push('#include "ccjs/json.h"')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "ccjs/map.h"')
    }
    if (needsObjectRuntime) {
      lines.push('#include "ccjs/object.h"')
    }
    if (needsCollectionRuntime) {
      lines.push('#include "ccjs/set.h"')
    }
    lines.push('#include "ccjs/string.h"')
  } else if (needsStringHeader) {
    lines.push('#include "ccjs/string.h"')
  }

  if (needsTimeRuntime) {
    lines.push('#include "ccjs/time.h"')
  }

  lines.push('')

  if (needsCryptoRuntime || (needsMathRuntime && (options.random?.backend ?? 'simple') === 'os')) {
    lines.push(...emitOsEntropyHelper())
    lines.push('')
  }

  if (needsMathRuntime) {
    lines.push(...emitMathHelpers(options.random))
    lines.push('')
  }

  if (needsCryptoRuntime) {
    lines.push(...emitCryptoHelpers())
    lines.push('')
  }

  if (needsRuntime) {
    lines.push('static void* ccjs_default_alloc(void* user, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)align;')
    lines.push('  return calloc(1, size);')
    lines.push('}')
    lines.push('')
    lines.push(
      'static void* ccjs_default_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {'
    )
    lines.push('  (void)user;')
    lines.push('  (void)old_size;')
    lines.push('  (void)align;')
    lines.push('  return realloc(ptr, new_size);')
    lines.push('}')
    lines.push('')
    lines.push('static void ccjs_default_free(void* user, void* ptr, size_t size, size_t align) {')
    lines.push('  (void)user;')
    lines.push('  (void)size;')
    lines.push('  (void)align;')
    lines.push('  free(ptr);')
    lines.push('}')
    lines.push('')
    if (needsDebugMemoryRuntime) {
      lines.push('static ccjs_allocator ccjs_default_base_allocator = {')
      lines.push('  0,')
      lines.push('  ccjs_default_alloc,')
      lines.push('  ccjs_default_realloc,')
      lines.push('  ccjs_default_free')
      lines.push('};')
      lines.push('')
    }
    lines.push('static ccjs_allocator ccjs_default_allocator = {')
    lines.push('  0,')
    lines.push('  ccjs_default_alloc,')
    lines.push('  ccjs_default_realloc,')
    lines.push('  ccjs_default_free')
    lines.push('};')
    lines.push('')

    if (needsDebugMemoryRuntime) {
      lines.push('static int ccjs_debug_memory_allocator_initialized = 0;')
      lines.push('')
      lines.push('static void ccjs_debug_memory_ensure_allocator(void) {')
      lines.push('  if (ccjs_debug_memory_allocator_initialized) return;')
      lines.push('  ccjs_debug_memory_allocator_initialized = 1;')
      lines.push('  ccjs_default_allocator = ccjs_debug_allocator(&ccjs_default_base_allocator);')
      lines.push('}')
      lines.push('')
    }

    if (needsTimerRuntime) {
      lines.push('static ccjs_status ccjs_timer_callback_run(void* context) {')
      lines.push('  if (context == 0) return CCJS_ERR_TYPE;')
      lines.push('  ccjs_value* callback = (ccjs_value*)context;')
      lines.push('  ccjs_value result = ccjs_undefined_value();')
      lines.push('  ccjs_status status = ccjs_callback_call(*callback, 0, 0, &result);')
      lines.push('  ccjs_release(result);')
      lines.push('  return status;')
      lines.push('}')
      lines.push('')
      lines.push('static void ccjs_timer_callback_finalize(void* context) {')
      lines.push('  if (context == 0) return;')
      lines.push('  ccjs_value* callback = (ccjs_value*)context;')
      lines.push('  ccjs_release(*callback);')
      lines.push('  ccjs_default_free(0, context, sizeof(ccjs_value), _Alignof(ccjs_value));')
      lines.push('}')
      lines.push('')
    }
  }

  return lines
}

function emitMathHelpers(random: RandomOptions = {}) {
  const randomSeed = emitRandomSeedLiteral(random)
  const randomBackend = random.backend ?? 'simple'

  return [
    'static double ccjs_math_abs(double value) {',
    '  return value < 0 ? -value : value;',
    '}',
    '',
    'static double ccjs_math_floor(double value) {',
    '  long long truncated = (long long)value;',
    '  return (double)truncated > value ? (double)(truncated - 1) : (double)truncated;',
    '}',
    '',
    'static double ccjs_math_ceil(double value) {',
    '  long long truncated = (long long)value;',
    '  return (double)truncated < value ? (double)(truncated + 1) : (double)truncated;',
    '}',
    '',
    'static double ccjs_math_round(double value) {',
    '  return ccjs_math_floor(value + 0.5);',
    '}',
    '',
    'static double ccjs_math_trunc(double value) {',
    '  return (double)((long long)value);',
    '}',
    '',
    'static double ccjs_math_fround(double value) {',
    '  return (double)((float)value);',
    '}',
    '',
    'static double ccjs_math_min(double left, double right) {',
    '  return left < right ? left : right;',
    '}',
    '',
    'static double ccjs_math_max(double left, double right) {',
    '  return left > right ? left : right;',
    '}',
    '',
    'static double ccjs_math_sqrt(double value) {',
    '  if (value < 0) return 0.0 / 0.0;',
    '  if (value == 0) return 0;',
    '  double estimate = value < 1 ? 1 : value;',
    '  for (int index = 0; index < 24; index += 1) {',
    '    estimate = 0.5 * (estimate + value / estimate);',
    '  }',
    '  return estimate;',
    '}',
    '',
    'static double ccjs_math_reduce_radians(double value) {',
    '  const double pi = 3.14159265358979323846;',
    '  const double tau = 6.28318530717958647692;',
    '  while (value > pi) value -= tau;',
    '  while (value < -pi) value += tau;',
    '  return value;',
    '}',
    '',
    'static double ccjs_math_sin(double value) {',
    '  double x = ccjs_math_reduce_radians(value);',
    '  double x2 = x * x;',
    '  return x * (1 - x2 / 6 + (x2 * x2) / 120 - (x2 * x2 * x2) / 5040 + (x2 * x2 * x2 * x2) / 362880);',
    '}',
    '',
    'static double ccjs_math_cos(double value) {',
    '  double x = ccjs_math_reduce_radians(value);',
    '  double x2 = x * x;',
    '  return 1 - x2 / 2 + (x2 * x2) / 24 - (x2 * x2 * x2) / 720 + (x2 * x2 * x2 * x2) / 40320;',
    '}',
    '',
    `static uint32_t ccjs_math_random_state = ${randomSeed};`,
    '',
    ...emitRandomBackendHelper(randomBackend)
  ]
}

function emitOsEntropyHeaders() {
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

function emitOsEntropyHelper() {
  return [
    'static int ccjs_os_random_bytes(uint8_t* out, size_t len) {',
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

function emitRandomBackendHelper(backend: NonNullable<RandomOptions['backend']>) {
  if (backend === 'os') {
    return [
      'static double ccjs_math_random(void) {',
      '  uint32_t value = 0;',
      '  if (!ccjs_os_random_bytes((uint8_t*)&value, sizeof(value))) {',
      '    ccjs_math_random_state = ccjs_math_random_state * 1664525u + 1013904223u;',
      '    value = ccjs_math_random_state;',
      '  }',
      '  return (double)(value >> 8) / 16777216.0;',
      '}'
    ]
  }

  if (backend === 'xorshift32') {
    return [
      'static double ccjs_math_random(void) {',
      '  if (ccjs_math_random_state == 0u) ccjs_math_random_state = 0x6d2b79f5u;',
      '  uint32_t value = ccjs_math_random_state;',
      '  value ^= value << 13;',
      '  value ^= value >> 17;',
      '  value ^= value << 5;',
      '  ccjs_math_random_state = value;',
      '  return (double)(value >> 8) / 16777216.0;',
      '}'
    ]
  }

  return [
    'static double ccjs_math_random(void) {',
    '  ccjs_math_random_state = ccjs_math_random_state * 1664525u + 1013904223u;',
    '  return (double)(ccjs_math_random_state >> 8) / 16777216.0;',
    '}'
  ]
}

function emitCryptoHelpers() {
  return [
    'static ccjs_status ccjs_crypto_get_random_values(ccjs_value value) {',
    '  if (value.tag != CCJS_TAG_BYTES || value.as.ref == 0) return CCJS_ERR_TYPE;',
    '  ccjs_bytes* bytes = (ccjs_bytes*)value.as.ref;',
    '  if (bytes->len == 0) return CCJS_OK;',
    '  return ccjs_os_random_bytes(bytes->bytes, bytes->len) ? CCJS_OK : CCJS_ERR_UNSUPPORTED;',
    '}'
  ]
}

function emitRandomSeedLiteral(random: RandomOptions = {}): string {
  if (random.backend != null && !['simple', 'xorshift32', 'os'].includes(random.backend)) {
    throw new Error(`unsupported random backend ${JSON.stringify(random.backend)}`)
  }

  const seed = random.seed ?? defaultRandomSeed

  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error('random.seed must be an integer from 0 to 4294967295')
  }

  return `0x${seed.toString(16).padStart(8, '0')}u`
}
