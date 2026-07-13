import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:events и node:stream diagnostics работают через named, renamed и default bindings', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const cases = [
    {
      source: "import { once as waitOnce } from 'node:events'\nwaitOnce(null, 'done')\n",
      message: 'node:events once is not implemented'
    },
    {
      source: "import events from 'node:events'\nnew events.EventEmitter()\n",
      message: 'node:events EventEmitter is not implemented'
    },
    {
      source: "import { EventEmitter } from 'node:events'\nconst EventClass = EventEmitter\n",
      message: 'node:events EventEmitter is not implemented'
    },
    {
      source: "import events from 'node:events'\nevents.defaultMaxListeners = 1\n",
      message: 'node:events defaultMaxListeners is not implemented'
    },
    {
      source: "import { finished as whenFinished } from 'node:stream'\nwhenFinished(null)\n",
      message: 'node:stream finished is not implemented'
    },
    {
      source: "import stream from 'node:stream'\nnew stream.Readable()\n",
      message: 'node:stream Readable is not implemented'
    },
    {
      source: "import { Readable } from 'node:stream'\nconst ReadableClass = Readable\n",
      message: 'node:stream Readable is not implemented'
    },
    {
      source: "import { promises as streamPromises } from 'node:stream'\nstreamPromises.pipeline()\n",
      message: 'node:stream promises.pipeline is not implemented'
    },
    {
      source: "import stream from 'node:stream'\nstream.promises.finished(null)\n",
      message: 'node:stream promises.finished is not implemented'
    }
  ]

  for (let index = 0; index < cases.length; index = index + 1) {
    const item = cases[index]

    assert.throws(
      () => compileSource(item.source, { libraries }),
      hasPackageDiagnostic(item.message),
      item.source.trim()
    )
  }
})

function hasPackageDiagnostic(messagePrefix: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof CompileError &&
    error.diagnostics.length === 1 &&
    error.diagnostics[0].code === 'INOX_NOT_IMPLEMENTED' &&
    error.diagnostics[0].message.startsWith(messagePrefix)
}
