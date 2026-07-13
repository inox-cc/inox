import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('node:timers владеет callback lifecycle и future-turn scheduling внутри native facade', async () => {
  const source = await readFile('stdlib/node/timers/src/timers.cc', 'utf8')
  const compiler = await compilerTypeScriptSource('compiler')

  assert.match(source, /namespace\s*\{/)
  assert.match(source, /(?:class|struct)\s+Timer(?:Handle)?State\b/)
  assert.match(source, /std::shared_ptr<Timer(?:Handle)?State>/)
  assert.match(source, /inox::Callback\s+callback_?\s*;/)
  assert.match(source, /std::move\(callback\)/)

  assert.match(source, /inox_loop_queue_immediate\(/)
  assert.match(source, /inox_loop_set_timeout\(/)
  assert.match(source, /inox_loop_set_interval\(/)
  assert.match(source, /inox_loop_clear_timer\(/)

  assert.match(source, /bool\s+(?:active|cleared|cancelled)_?\s*;/)
  assert.match(source, /if\s*\([^)]*(?:active|cleared|cancelled)_?[^)]*\)\s*\{\s*return;/)
  assert.match(source, /(?:active_?\s*=\s*false|(?:cleared|cancelled)_?\s*=\s*true)\s*;/)
  assert.match(source, /callback_?\s*=\s*inox::Callback\(\)\s*;/)

  assert.doesNotMatch(compiler, /\binox_timer_callback_(?:run|finalize)\b/)
})

async function compilerTypeScriptSource(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true })
  const sources: string[] = []

  for (const entry of entries) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      sources.push(await compilerTypeScriptSource(path))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      sources.push(await readFile(path, 'utf8'))
    }
  }

  return sources.join('\n')
}
