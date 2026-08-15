#!/usr/bin/env node

import fs from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !new URL(url).pathname.endsWith('.ts')) {
      return nextLoad(url, context)
    }

    const file = fileURLToPath(url)
    const source = fs.readFileSync(file, 'utf8')
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        inlineSourceMap: true,
        inlineSources: true,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2024
      },
      fileName: file
    })

    return {
      format: 'module',
      shortCircuit: true,
      source: transpiled.outputText
    }
  }
})

await import('../compiler/index.ts')
