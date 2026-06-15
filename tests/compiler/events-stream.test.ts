import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('reports node:events EventEmitter and async helper diagnostics', () => {
  assert.throws(
    () => {
      compileSource(
        `import events, { EventEmitter, once, on } from 'node:events'

const emitter = new EventEmitter()
once(emitter, 'ready')
events.on(emitter, 'data')
on(emitter, 'close')
`,
        {
          target: 'c'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics.some((item) => item.message.includes('node:events EventEmitter')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('event dispatch')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('node:events once')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('node:events on')), true)
      return true
    }
  )
})

test('reports node:stream readable writable pipeline and finished diagnostics', () => {
  assert.throws(
    () => {
      compileSource(
        `import stream, { Readable, Writable, finished, pipeline } from 'node:stream'

const readable = new Readable()
const writable = new Writable()
pipeline(readable, writable, () => {})
stream.finished(writable, () => {})
finished(readable, () => {})
stream.promises.pipeline(readable, writable)
`,
        {
          target: 'c'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics.some((item) => item.message.includes('node:stream Readable')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('node:stream Writable')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('stream buffering and backpressure')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('node:stream pipeline')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('node:stream finished')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('node:stream promises.pipeline')), true)
      return true
    }
  )
})

test('unused node:events and node:stream imports do not emit runtime stubs', () => {
  const result = compileSource(
    `import events from 'node:events'
import stream from 'node:stream'

console.log('ok')
`,
    {
      target: 'c'
    }
  )

  assert.doesNotMatch(result.code, /ccjs_events|ccjs_stream|events\.h|stream\.h/)
})
