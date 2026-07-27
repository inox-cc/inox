import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { prepareRuntimeArchives } from './helpers/runtime-c.ts'
import {
  assertCcAvailable,
  assertFeatureCompilerAvailable,
  collectFeatureTestFiles,
  type FeatureTestCompiler,
  type FeatureTestFile,
  featureTestSkipReason,
  featureTestName,
  readFeatureTestFile,
  runFeatureTest
} from './helpers/feature-tests.ts'

type FeatureTestStatus = 'passed' | 'failed' | 'skipped'

type FeatureTestResult = {
  name: string
  status: FeatureTestStatus
  message?: string
  reason?: string
}

type WorkerRequest = {
  id: number
  file: string
  compiler: FeatureTestCompiler
}

type WorkerResponse = {
  id: number
  result: FeatureTestResult
}

const workerArg = '--feature-test-worker'
const workerScript = fileURLToPath(import.meta.url)

if (process.argv[2] === workerArg) {
  await runFeatureWorkerProcess()
} else {
  const options = parseRunnerOptions(process.argv.slice(2))

  if (options.compiler.kind !== 'node') {
    await assertCcAvailable()
  }
  await assertFeatureCompilerAvailable(options.compiler)

  const files = await collectFeatureTestFiles(options.paths)
  const parallelism = featureTestParallelism(options.compiler)

  assert.notEqual(files.length, 0, 'feature tests: no .test.ts files found')

  if (options.compiler.kind !== 'node') {
    console.log('precompiling C runtime for feature tests')
    await prepareRuntimeArchives()
  }

  await runFeatureTests(files, parallelism, options.compiler)

  if (shouldRunHostedIntegrationTests(options)) {
    await runHostedIntegrationTests()
  }

  if (shouldRunNativeCompilerIntegrationTests(options)) {
    await runNativeCompilerIntegrationTests(options.compiler.path)
  }
}

function featureTestParallelism(compiler: FeatureTestCompiler): number {
  const configured = configuredFeatureTestParallelism()

  if (configured !== null) {
    return configured
  }

  const cpuCount = availableParallelism()

  if (compiler.kind === 'binary') {
    return Math.max(1, Math.ceil(cpuCount / 2))
  }

  return cpuCount
}

function configuredFeatureTestParallelism(): number | null {
  const raw = process.env.INOX_TEST_JOBS

  if (raw === null || typeof raw === 'undefined' || raw === '') {
    return null
  }

  const value = Number(raw)

  assert.ok(Number.isInteger(value) && value > 0, 'INOX_TEST_JOBS must be a positive integer')

  return value
}

function shouldRunHostedIntegrationTests(options: RunnerOptions): boolean {
  return options.compiler.kind === 'hosted' && options.paths.length === 0
}

function shouldRunNativeCompilerIntegrationTests(
  options: RunnerOptions
): options is RunnerOptions & { compiler: Extract<FeatureTestCompiler, { kind: 'binary' }> } {
  return options.compiler.kind === 'binary' && options.paths.length === 0
}

async function runHostedIntegrationTests(): Promise<void> {
  const { assertArrayLowersToGlobalObject } = await import('./integration/array-global-object-lowering.test.ts')
  const { assertBuildCMakeConfigureIsQuiet } = await import('./integration/build-cmake-log-level.test.ts')
  const { assertBufferLowersToCppObject, assertBufferNativeFacadeHidesAllocatorOverloads } =
    await import('./integration/buffer-cpp-object-lowering.test.ts')
  const { assertCPreludeIncludeOrder } = await import('./integration/c-prelude-include-order.test.ts')
  const { assertConsoleLowersToGlobalObject } = await import('./integration/console-global-object-lowering.test.ts')
  const { assertCompilerIndexNodeHelp } = await import('./integration/compiler-index-node-help.test.ts')
  const { assertDateLowersToGlobalObject } = await import('./integration/date-global-object-lowering.test.ts')
  const { assertPerformanceLowersToGlobalObject } =
    await import('./integration/performance-global-object-lowering.test.ts')
  const {
    assertAwaitCatchOnlyDoesNotEmitErrorActiveState,
    assertCatchOnlyDoesNotEmitErrorActiveState,
    assertFinallyStillEmitsErrorActiveState
  } = await import('./integration/error-flow-state-lowering.test.ts')
  const { assertFetchAwaitUsesCppWrappers, assertFetchRuntimeFacadesUseCppObjects } =
    await import('./integration/fetch-await-cpp-lowering.test.ts')
  const { assertGeneratedCatchLabelStaysWithTryBlock } =
    await import('./integration/generated-label-spacing.test.ts')
  const {
    assertAwaitFunctionUsesExternalLoopRuntime,
    assertGeneratedMainDoesNotCollideWithUserMain,
    assertModuleMainUsesRaiiReturns,
    assertProcessMainUsesReturnCodeHelper,
    assertUnitMainUsesRaiiReturns
  } = await import('./integration/main-raii-lowering.test.ts')
  const { assertModuleDeclarationImportBoundary } =
    await import('./integration/module-declaration-import-boundary.test.ts')
  const { assertModuleDeclarationContracts } = await import('./integration/module-declaration-contracts.test.ts')
  const { assertModuleDeclarationFunctionKeywordType } =
    await import('./integration/module-declaration-function-keyword-type.test.ts')
  const { assertModuleDeclarationGenericFunction } =
    await import('./integration/module-declaration-generic-function.test.ts')
  const { assertModuleDeclarationInferredConsts } =
    await import('./integration/module-declaration-inferred-consts.test.ts')
  const { assertModuleDeclarationImportedNestedArrayShape } =
    await import('./integration/module-declaration-imported-nested-array-shape.test.ts')
  const { assertModuleDeclarationImportedOptionalFields } =
    await import('./integration/module-declaration-imported-optional-fields.test.ts')
  const { assertModuleDeclarationImports } = await import('./integration/module-declaration-imports.test.ts')
  const { assertModuleDeclarationWeakTypeMarker } =
    await import('./integration/module-declaration-weak-type-marker.test.ts')
  const { assertObjectLowersToGlobalObject } = await import('./integration/object-global-object-lowering.test.ts')
  const { assertObjectRuntimeIndexUsesDirectHelpers } =
    await import('./integration/object-runtime-index-lowering.test.ts')
  const { assertJsonParseCatchUsesRaiiErrorReset, assertJsonParseLiteralShapeUsesDirectVariableTarget } =
    await import('./integration/json-parse-shape-lowering.test.ts')
  const { assertJsonLowersToGlobalObject } = await import('./integration/json-global-object-lowering.test.ts')
  const { assertFsReadFileSyncLowersToCppObject } = await import('./integration/fs-cpp-object-lowering.test.ts')
  const { assertChildProcessLowersToCppObject } =
    await import('./integration/child-process-cpp-object-lowering.test.ts')
  const { assertClassSuperDiagnosticUsesInheritanceCode } = await import('./integration/class-diagnostics.test.ts')
  const { assertNativeClassAsyncStateDoesNotSplitMethods } =
    await import('./integration/native-class-async-state-order.test.ts')
  const {
    assertNativeClassExplicitUnknownReturnIsPreserved,
    assertNativeClassLoopReturnKeepsRuntimeReturn,
    assertNativeClassVoidStringFieldLogMethod
  } = await import('./integration/native-class-method-log-lowering.test.ts')
  const { assertNativeClassModuleMethodCallUsesNativeReceiver } =
    await import('./integration/native-class-module-method-call.test.ts')
  const { assertTestsDoNotReferenceExamples } = await import('./integration/no-example-dependencies.test.ts')
  const { assertPromiseAwaitCatchReadsRejectedValue, assertPromiseAwaitUsesRuntimeHelper } =
    await import('./integration/promise-await-helper-lowering.test.ts')
  const { assertPromiseVariablesUseCppRaii } = await import('./integration/promise-raii-lowering.test.ts')
  const { assertPromiseObserveFailureRetainsCallbackContext } =
    await import('./integration/promise-observe-ownership.test.ts')
  const { assertPathLowersToCppObject } = await import('./integration/path-cpp-object-lowering.test.ts')
  const { assertNetUsesCppObjectFacade } = await import('./integration/net-cpp-object-lowering.test.ts')
  const { assertHttpServerUsesCppObjectFacade } = await import('./integration/http-cpp-object-lowering.test.ts')
  const { assertReadableCStringLiterals } = await import('./integration/readable-c-string-literals.test.ts')
  const { assertRegExpLowersToCppObject } = await import('./integration/regexp-cpp-object-lowering.test.ts')
  const { assertRuntimeAllocatorStaysInRuntime } = await import('./integration/runtime-allocator-prelude.test.ts')
  const { assertStringMethodsLowerToCppObject, assertStringRuntimeMethodsStayDirect } =
    await import('./integration/string-cpp-object-lowering.test.ts')
  const { assertRuntimeValueDeclarationsStayLocal } =
    await import('./integration/runtime-value-local-declaration-lowering.test.ts')
  const { assertUninitializedRuntimeValuesUseCppRaii } =
    await import('./integration/runtime-value-uninitialized-raii-lowering.test.ts')
  const { assertRuntimeValueDeclarationsReuseTypedHelperContracts } =
    await import('./integration/runtime-value-type-check-lowering.test.ts')
  const {
    assertNativeClassArrayRuntimeFieldLowering,
    assertNativeClassDefinitionsPrecedeModuleValues,
    assertNativeClassFieldAliasLowering,
    assertNativeClassFieldRestoreFromObjectLowering,
    assertNativeClassLowering,
    assertNativeClassMapRuntimeFieldLowering,
    assertNativeClassModuleUniqueSymbols,
    assertNativeClassRuntimeDescriptorLowering,
    assertNativeClassRuntimeValueFieldLowering,
    assertNativeClassStringLiteralConstructorUsesCppValue,
    assertNativeClassSetRuntimeFieldLowering
  } = await import('./integration/native-class-lowering.test.ts')
  const { assertRuntimeValueCoreDoesNotReferenceFeatureDisposers } =
    await import('./integration/runtime-value-core-dependencies.test.ts')
  const { assertThrowingErrorTransferUsesValueRelease } =
    await import('./integration/throwing-error-transfer-lowering.test.ts')
  const { assertUrlRuntimeUsesStringFacade, assertUrlSearchParamsLowersStringLiteralsDirectly } =
    await import('./integration/url-cpp-object-lowering.test.ts')

  await test('compiler integration checks', async (t) => {
    await t.test('no-example-dependencies', async () => {
      await assertTestsDoNotReferenceExamples()
    })

    await t.test('build-cmake-log-level', () => {
      assertBuildCMakeConfigureIsQuiet()
    })

    await t.test('array-global-object-lowering', () => {
      assertArrayLowersToGlobalObject()
    })

    await t.test('c-prelude-include-order', () => {
      assertCPreludeIncludeOrder()
    })

    await t.test('console-global-object-lowering', () => {
      assertConsoleLowersToGlobalObject()
    })

    await t.test('compiler-index-node-help', async () => {
      await assertCompilerIndexNodeHelp()
    })

    await t.test('date-global-object-lowering', () => {
      assertDateLowersToGlobalObject()
    })

    await t.test('performance-global-object-lowering', () => {
      assertPerformanceLowersToGlobalObject()
    })

    await t.test('error-flow-state-lowering', () => {
      assertCatchOnlyDoesNotEmitErrorActiveState()
      assertAwaitCatchOnlyDoesNotEmitErrorActiveState()
      assertFinallyStillEmitsErrorActiveState()
    })

    await t.test('fetch-await-cpp-lowering', () => {
      assertFetchAwaitUsesCppWrappers()
      assertFetchRuntimeFacadesUseCppObjects()
    })

    await t.test('generated-label-spacing', () => {
      assertGeneratedCatchLabelStaysWithTryBlock()
    })

    await t.test('main-raii-lowering', () => {
      assertUnitMainUsesRaiiReturns()
      assertModuleMainUsesRaiiReturns()
      assertGeneratedMainDoesNotCollideWithUserMain()
      assertAwaitFunctionUsesExternalLoopRuntime()
      assertProcessMainUsesReturnCodeHelper()
    })

    await t.test('module-declaration-contracts', () => {
      assertModuleDeclarationContracts()
    })

    await t.test('module-declaration-function-keyword-type', () => {
      assertModuleDeclarationFunctionKeywordType()
    })

    await t.test('module-declaration-generic-function', () => {
      assertModuleDeclarationGenericFunction()
    })

    await t.test('module-declaration-inferred-consts', () => {
      assertModuleDeclarationInferredConsts()
    })

    await t.test('module-declaration-imported-nested-array-shape', () => {
      assertModuleDeclarationImportedNestedArrayShape()
    })

    await t.test('module-declaration-imported-optional-fields', () => {
      assertModuleDeclarationImportedOptionalFields()
    })

    await t.test('module-declaration-import-boundary', () => {
      assertModuleDeclarationImportBoundary()
    })

    await t.test('module-declaration-imports', () => {
      assertModuleDeclarationImports()
    })

    await t.test('module-declaration-weak-type-marker', () => {
      assertModuleDeclarationWeakTypeMarker()
    })

    await t.test('json-parse-shape-lowering', () => {
      assertJsonParseLiteralShapeUsesDirectVariableTarget()
      assertJsonParseCatchUsesRaiiErrorReset()
    })

    await t.test('json-global-object-lowering', () => {
      assertJsonLowersToGlobalObject()
    })

    await t.test('object-global-object-lowering', () => {
      assertObjectLowersToGlobalObject()
    })

    await t.test('object-runtime-index-lowering', () => {
      assertObjectRuntimeIndexUsesDirectHelpers()
    })

    await t.test('class-super-diagnostic-uses-inheritance-code', () => {
      assertClassSuperDiagnosticUsesInheritanceCode()
    })

    await t.test('native-class-lowering', () => {
      assertNativeClassLowering()
    })

    await t.test('native-class-runtime-descriptor-lowering', () => {
      assertNativeClassRuntimeDescriptorLowering()
    })

    await t.test('native-class-runtime-value-field-lowering', () => {
      assertNativeClassRuntimeValueFieldLowering()
    })

    await t.test('native-class-array-runtime-field-lowering', () => {
      assertNativeClassArrayRuntimeFieldLowering()
    })

    await t.test('native-class-map-runtime-field-lowering', () => {
      assertNativeClassMapRuntimeFieldLowering()
    })

    await t.test('native-class-set-runtime-field-lowering', () => {
      assertNativeClassSetRuntimeFieldLowering()
    })

    await t.test('native-class-field-alias-lowering', () => {
      assertNativeClassFieldAliasLowering()
    })

    await t.test('native-class-field-restore-from-object-lowering', () => {
      assertNativeClassFieldRestoreFromObjectLowering()
    })

    await t.test('native-class-void-string-field-log-method', () => {
      assertNativeClassVoidStringFieldLogMethod()
    })

    await t.test('native-class-async-state-order', () => {
      assertNativeClassAsyncStateDoesNotSplitMethods()
    })

    await t.test('native-class-loop-return-keeps-runtime-return', () => {
      assertNativeClassLoopReturnKeepsRuntimeReturn()
    })

    await t.test('native-class-explicit-unknown-return-is-preserved', () => {
      assertNativeClassExplicitUnknownReturnIsPreserved()
    })

    await t.test('native-class-string-literal-constructor-uses-cpp-value', () => {
      assertNativeClassStringLiteralConstructorUsesCppValue()
    })

    await t.test('native-class-definitions-precede-module-values', () => {
      assertNativeClassDefinitionsPrecedeModuleValues()
    })

    await t.test('native-class-module-unique-symbols', () => {
      assertNativeClassModuleUniqueSymbols()
    })

    await t.test('native-class-module-method-call', () => {
      assertNativeClassModuleMethodCallUsesNativeReceiver()
    })

    await t.test('readable-c-string-literals', () => {
      assertReadableCStringLiterals()
    })

    await t.test('fs-cpp-object-lowering', () => {
      assertFsReadFileSyncLowersToCppObject()
    })

    await t.test('child-process-cpp-object-lowering', () => {
      assertChildProcessLowersToCppObject()
    })

    await t.test('buffer-cpp-object-lowering', () => {
      assertBufferLowersToCppObject()
      assertBufferNativeFacadeHidesAllocatorOverloads()
    })

    await t.test('path-cpp-object-lowering', () => {
      assertPathLowersToCppObject()
    })

    await t.test('net-cpp-object-lowering', () => {
      assertNetUsesCppObjectFacade()
    })

    await t.test('http-cpp-object-lowering', async () => {
      await assertHttpServerUsesCppObjectFacade()
    })

    await t.test('regexp-cpp-object-lowering', () => {
      assertRegExpLowersToCppObject()
    })

    await t.test('string-cpp-object-lowering', () => {
      assertStringMethodsLowerToCppObject()
      assertStringRuntimeMethodsStayDirect()
    })

    await t.test('promise-await-helper-lowering', () => {
      assertPromiseAwaitUsesRuntimeHelper()
      assertPromiseAwaitCatchReadsRejectedValue()
    })

    await t.test('promise-raii-lowering', () => {
      assertPromiseVariablesUseCppRaii()
    })

    await t.test('Promise observe сохраняет ownership callback context при ошибке', async () => {
      await assertPromiseObserveFailureRetainsCallbackContext()
    })

    await t.test('throwing-error-transfer-lowering', () => {
      assertThrowingErrorTransferUsesValueRelease()
    })

    await t.test('url-cpp-object-lowering', () => {
      assertUrlRuntimeUsesStringFacade()
      assertUrlSearchParamsLowersStringLiteralsDirectly()
    })

    await t.test('runtime-allocator-prelude', () => {
      assertRuntimeAllocatorStaysInRuntime()
    })

    await t.test('runtime-value-type-check-lowering', () => {
      assertRuntimeValueDeclarationsReuseTypedHelperContracts()
    })

    await t.test('runtime-value-local-declaration-lowering', () => {
      assertRuntimeValueDeclarationsStayLocal()
    })

    await t.test('runtime-value-uninitialized-raii-lowering', () => {
      assertUninitializedRuntimeValuesUseCppRaii()
    })

    await t.test('runtime-value-core-dependencies', async () => {
      await assertRuntimeValueCoreDoesNotReferenceFeatureDisposers()
    })
  })
}

async function runNativeCompilerIntegrationTests(compilerPath: string): Promise<void> {
  const { assertCliEntryModuleMain } = await import('./integration/cli-entry-module-main.test.ts')
  const { assertNativeJsonParseUnicodeLiteralShapeUsesDirectVariableTarget } =
    await import('./integration/json-parse-shape-lowering.test.ts')
  const { assertNativeInoxDefaultOutput, assertNativeInoxHelp, assertNativeInoxRuntimeSmoke } =
    await import('./integration/native-inox-help.test.ts')
  const { assertNativeInoxModuleGraph } = await import('./integration/native-inox-module-graph.test.ts')
  const { assertNativeInoxProcessRuntimeString } =
    await import('./integration/native-inox-process-runtime-string.test.ts')
  const { assertNativeInoxUnicodeStringLiteral } =
    await import('./integration/native-inox-unicode-string-literal.test.ts')

  await test('native compiler integration checks', async (t) => {
    await t.test('cli-entry-module-main', async () => {
      await assertCliEntryModuleMain(compilerPath)
    })

    await t.test('native-json-parse-unicode-shape-lowering', async () => {
      await assertNativeJsonParseUnicodeLiteralShapeUsesDirectVariableTarget(compilerPath)
    })

    await t.test('native-inox-help', async () => {
      await assertNativeInoxHelp(compilerPath)
    })

    await t.test('native-inox-default-output', async () => {
      await assertNativeInoxDefaultOutput(compilerPath)
    })

    await t.test('native-inox-runtime-smoke', async () => {
      await assertNativeInoxRuntimeSmoke(compilerPath)
    })

    await t.test('native-inox-module-graph', async () => {
      await assertNativeInoxModuleGraph(compilerPath)
    })

    await t.test('native-inox-process-runtime-string', async () => {
      await assertNativeInoxProcessRuntimeString(compilerPath)
    })

    await t.test('native-inox-unicode-string-literal', async () => {
      await assertNativeInoxUnicodeStringLiteral(compilerPath)
    })
  })
}

type RunnerOptions = {
  compiler: FeatureTestCompiler
  paths: string[]
}

async function runFeatureTests(files: string[], parallelism: number, compiler: FeatureTestCompiler): Promise<void> {
  await test('compiler feature matrix', { concurrency: parallelism }, async (t) => {
    await Promise.all(
      files.map((file) =>
        t.test(featureTestName(file), async (context) => {
          const result = await runFeatureFileInProcess(file, compiler)

          if (result.status === 'skipped') {
            context.skip(result.reason ?? 'skipped')
            return
          }

          assert.equal(result.status, 'passed', result.message ?? `${result.name}: failed`)
        })
      )
    )
  })
}

async function runFeatureFileInProcess(file: string, compiler: FeatureTestCompiler): Promise<FeatureTestResult> {
  const worker = createFeatureWorker()

  try {
    return await worker.run(file, compiler)
  } finally {
    worker.close()
  }
}

function createFeatureWorker(): {
  run: (file: string, compiler: FeatureTestCompiler) => Promise<FeatureTestResult>
  close: () => void
} {
  const child = fork(workerScript, [workerArg], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  let nextRequestId = 1
  let stdout = ''
  let stderr = ''

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    stdout = stdout + chunk
  })
  child.stderr?.on('data', (chunk: string) => {
    stderr = stderr + chunk
  })

  return {
    run: (file, compiler) =>
      new Promise<FeatureTestResult>((resolve, reject) => {
        const id = nextRequestId
        nextRequestId = nextRequestId + 1
        const request: WorkerRequest = {
          id,
          file,
          compiler
        }

        const cleanup = (): void => {
          child.off('message', onMessage)
          child.off('error', onError)
          child.off('exit', onExit)
          stdout = ''
          stderr = ''
        }
        const rejectWithOutput = (error: unknown): void => {
          const workerStdout = stdout
          const workerStderr = stderr
          cleanup()
          reject(formatWorkerProcessError(file, error, workerStdout, workerStderr))
        }
        const onMessage = (message: unknown): void => {
          if (!isWorkerResponse(message) || message.id !== id) {
            rejectWithOutput(new Error('feature test worker returned an invalid response'))
            return
          }

          cleanup()
          resolve(message.result)
        }
        const onError = (error: Error): void => {
          rejectWithOutput(error)
        }
        const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
          rejectWithOutput(
            new Error(`feature test worker exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`)
          )
        }

        child.on('message', onMessage)
        child.once('error', onError)
        child.once('exit', onExit)

        if (!child.send(request)) {
          rejectWithOutput(new Error('feature test worker IPC channel is closed'))
        }
      }),
    close: () => {
      if (child.connected) {
        child.disconnect()
      }
    }
  }
}

async function runFeatureWorkerProcess(): Promise<void> {
  process.on('message', (message: unknown) => {
    void handleFeatureWorkerMessage(message)
  })

  await new Promise<void>((resolve) => {
    process.once('disconnect', resolve)
  })
}

async function handleFeatureWorkerMessage(message: unknown): Promise<void> {
  if (!isWorkerRequest(message)) {
    sendWorkerResponse({
      id: 0,
      result: {
        name: 'feature-worker',
        status: 'failed',
        message: 'feature-worker: failed\ninvalid worker request'
      }
    })
    return
  }

  let result: FeatureTestResult

  try {
    result = await runFeatureFile(message.file, message.compiler)
  } catch (error) {
    result = {
      name: featureTestName(message.file),
      status: 'failed',
      message: formatFeatureFailure(featureTestName(message.file), error)
    }
  }

  sendWorkerResponse({
    id: message.id,
    result
  })
}

function sendWorkerResponse(response: WorkerResponse): void {
  if (process.send) {
    process.send(response)
  }
}

async function runFeatureFile(file: string, compiler: FeatureTestCompiler): Promise<FeatureTestResult> {
  let featureFile: FeatureTestFile

  try {
    featureFile = await readFeatureTestFile(file)
  } catch (error) {
    return {
      name: featureTestName(file),
      status: 'failed',
      message: formatFeatureFailure(featureTestName(file), error)
    }
  }

  if (!featureFile.targets.includes('cc')) {
    return {
      name: featureFile.name,
      status: 'skipped',
      reason: `targets: ${featureFile.targets.join(', ')}`
    }
  }

  const skipReason = featureTestSkipReason(featureFile, compiler)

  if (skipReason) {
    return {
      name: featureFile.name,
      status: 'skipped',
      reason: skipReason
    }
  }

  try {
    await runFeatureTest(featureFile, {
      compiler
    })
    return {
      name: featureFile.name,
      status: 'passed'
    }
  } catch (error) {
    return {
      name: featureFile.name,
      status: 'failed',
      message: formatFeatureFailure(featureFile.name, error)
    }
  }
}

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === 'number' && typeof value.file === 'string' && isFeatureTestCompiler(value.compiler)
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === 'number' && isFeatureTestResult(value.result)
}

function isFeatureTestResult(value: unknown): value is FeatureTestResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.name === 'string' &&
    (value.status === 'passed' || value.status === 'failed' || value.status === 'skipped') &&
    (value.message === undefined || typeof value.message === 'string') &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isFeatureTestCompiler(value: unknown): value is FeatureTestCompiler {
  if (!isRecord(value)) {
    return false
  }

  if (value.kind === 'hosted') {
    return true
  }

  if (value.kind === 'node') {
    return true
  }

  return value.kind === 'binary' && typeof value.path === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRunnerOptions(args: string[]): RunnerOptions {
  const paths: string[] = []
  let compiler: FeatureTestCompiler = {
    kind: 'hosted'
  }

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]

    if (arg === '--') {
      paths.push(...args.slice(index + 1))
      break
    }

    if (arg === '--compiler') {
      const value = args[index + 1]
      index = index + 1

      assert.ok(value && !value.startsWith('-'), '--compiler expects hosted, node or a compiler binary path')
      compiler = parseFeatureTestCompiler(value)
      continue
    }

    if (arg.startsWith('--compiler=')) {
      compiler = parseFeatureTestCompiler(arg.slice('--compiler='.length))
      continue
    }

    paths.push(arg)
  }

  return {
    compiler,
    paths
  }
}

function parseFeatureTestCompiler(value: string): FeatureTestCompiler {
  if (value === 'hosted') {
    return {
      kind: 'hosted'
    }
  }

  if (value === 'node') {
    return {
      kind: 'node'
    }
  }

  return {
    kind: 'binary',
    path: resolve(value)
  }
}

function formatFeatureFailure(name: string, error: unknown): string {
  if (error instanceof Error) {
    return [`${name}: failed`, error.stack ?? error.message].join('\n')
  }

  return [`${name}: failed`, String(error)].join('\n')
}

function formatWorkerProcessError(file: string, error: unknown, stdout: string, stderr: string): Error {
  const details = [formatFeatureFailure(featureTestName(file), error)]

  if (stdout.length > 0) {
    details.push(`worker stdout:\n${stdout}`)
  }

  if (stderr.length > 0) {
    details.push(`worker stderr:\n${stderr}`)
  }

  return new Error(details.join('\n'))
}
