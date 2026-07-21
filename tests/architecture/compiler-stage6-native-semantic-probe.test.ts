import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

test('native decoupling probe точно сравнивается с hosted contract', async () => {
  const [buildSource, registrySource, contractSource, packageSource, testInoxSource] = await Promise.all([
    readFile('scripts/build.ts', 'utf8'),
    readFile('scripts/lib/compiler-library-registry.ts', 'utf8'),
    readFile('tests/contracts/stage6-semantic-contract.ts', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('scripts/test-inox.ts', 'utf8')
  ])
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> }

  assert.doesNotMatch(contractSource, /node:(?:assert|fs|test)/)
  assert.match(registrySource, /runStage6SemanticContract/)
  assert.match(buildSource, /compilerFiles\.push\(await readProjectSource\(stage6SemanticContractPath\)\)/)
  assert.match(buildSource, /add_library\(inox_compiler_modules OBJECT/)
  assert.match(buildSource, /TARGET_OBJECTS:inox_compiler_modules/)
  assert.match(
    buildSource,
    /list\(REMOVE_ITEM INOX_COMPILER_MODULE_SOURCES[\s\S]+?\$\{INOX_SEMANTIC_CONTRACT_SOURCE\}[\s\S]+?\)/
  )
  assert.match(
    buildSource,
    /inox_add_native_driver\([\s\S]+?inox_stage6_semantic_probe[\s\S]+?\$\{INOX_SEMANTIC_PROBE_ENTRY_SOURCE\}[\s\S]+?\$\{INOX_SEMANTIC_CONTRACT_SOURCE\}[\s\S]+?\)/
  )
  assert.doesNotMatch(
    buildSource,
    /inox_add_native_driver\(inox \$\{INOX_NATIVE_ENTRY_SOURCE\}[^\n]*INOX_SEMANTIC_CONTRACT_SOURCE/
  )
  assert.match(buildSource, /add_dependencies\(inox inox_stage6_semantic_probe\)/)
  assert.match(packageJson.scripts['test:inox'], /scripts\/test-inox\.ts/)
  assert.match(packageJson.scripts['test:inox'], /--semantic-probe dist\/inox-stage6-semantic-probe/)
  assert.match(testInoxSource, /runStage6SemanticContract/)
  assert.match(testInoxSource, /isDeepStrictEqual\(parsedNativeSnapshot, hostedContract\.snapshot\)/)

  const probeEntry = renderCompilerLibraryRegistry([]).nativeSemanticProbeEntrySource

  assert.match(probeEntry, /try \{[\s\S]+runStage6SemanticContract\(\)/)
  assert.match(probeEntry, /for \(const failure of result\.failures\) \{\n    console\.error\(failure\)/)
  assert.match(probeEntry, /if \(!result\.ok\) \{\n    process\.exitCode = 1/)
  assert.match(probeEntry, /INOX_DECOUPLING_CONTRACT/)
  assert.match(
    probeEntry,
    /\} catch \{\n  console\.error\('Compiler\/stdlib decoupling contract threw unexpectedly'\)\n  process\.exitCode = 1/
  )
})
