import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

test('node:timers использует declarations-only JS-shaped RAII C++ facade', async () => {
  const sourceFiles = (await readdir('stdlib/node/timers/src')).sort()
  const headerFiles = (await readdir('stdlib/node/timers/include/inox')).sort()

  assert.deepEqual(sourceFiles, ['timers.cc'])
  assert.deepEqual(headerFiles, ['timers.h'])

  const header = await readFile('stdlib/node/timers/include/inox/timers.h', 'utf8')

  assert.match(header, /#include "inox\/callback\.h"/)
  assertRaiiHandle(header, 'TimeoutHandle')
  assertRaiiHandle(header, 'IntervalHandle')
  assertRaiiHandle(header, 'ImmediateHandle')
  assert.match(header, /class TimersModule/)
  assert.match(header, /TimeoutHandle setTimeout\(inox::Callback[^,]*,\s*double[^)]*\) const;/)
  assert.match(header, /void clearTimeout\(const TimeoutHandle&[^)]*\) const;/)
  assert.match(header, /IntervalHandle setInterval\(inox::Callback[^,]*,\s*double[^)]*\) const;/)
  assert.match(header, /void clearInterval\(const IntervalHandle&[^)]*\) const;/)
  assert.match(header, /ImmediateHandle setImmediate\(inox::Callback[^)]*\) const;/)
  assert.match(header, /void clearImmediate\(const ImmediateHandle&[^)]*\) const;/)
  assert.match(header, /extern const TimersModule timers;/)

  assert.doesNotMatch(header, /\binox_timer_handle\b|\binox_loop_\w*\b|\bvoid\s*\*/)
  assert.doesNotMatch(header, /\binox_(?:status|value|allocator)\b|\binox_[a-zA-Z0-9_]+\s*\(|extern\s+"C"|\btypedef\b/)
  assert.doesNotMatch(header, /\binline\b|\btemplate\s*</)
  assert.doesNotMatch(header, /\)\s*(?:const\s*)?\{/)
})

function assertRaiiHandle(header: string, name: string): void {
  assert.match(header, new RegExp(`class ${name}\\b`))
  assert.match(header, new RegExp(`~${name}\\(\\);`))
}
