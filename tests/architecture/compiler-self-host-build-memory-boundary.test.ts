import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('self-host build releases per-module compiler graphs at a bounded GC boundary', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
  const buildSource = await readFile('scripts/build.ts', 'utf8')

  assert.equal(packageJson.scripts.build, 'node --max-old-space-size=6144 --expose-gc scripts/build.ts')
  assert.match(buildSource, /compiledModules\.push\(result\.module\)\s+releaseSelfHostedCompilationMemory\(\)/)
  assert.match(
    buildSource,
    /await writeGeneratedFiles\(generatedDir, modules\.files\)[\s\S]*?for \(const requirement of modules\.irRuntimeRequirements\)[\s\S]*?releaseSelfHostedCompilationMemory\(\)/
  )
  assert.doesNotMatch(buildSource, /contract\.resolvedProgram/)
  assert.match(buildSource, /self-hosted build must run Node with --expose-gc/)
})
