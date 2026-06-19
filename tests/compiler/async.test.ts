import test from 'node:test'
import {
  assert,
  assertDiagnostic,
  cLibuvOptions,
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  compileFile,
  compileSource,
  CompileError,
  emitCBundleFromIrModules,
  emitCFromIr,
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
} from '../helpers/compiler-smoke.ts'



test('drives C async task wrapper selection from target-neutral IR function declarations', () => {
  const result = compileSource(
    `async function getValue(): Promise<number> {
  const value = await Promise.resolve(2)
  return value
}

export async function main(): Promise<void> {
  const value = await getValue()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )
  const ir = {
    ...result.ir,
    body: result.ir.body.map((item) =>
      item.type === 'FunctionDeclaration' && item.name === 'getValue'
        ? {
            ...item,
            async: false,
            returnPromiseValueType: null
          }
        : item
    )
  }
  const entries = collectIrFunctionNodeEntries([ir])
  const getValue = entries.find((item) => item.declaration.name === 'getValue')
  const code = emitCFromIr(ir)

  assert.equal(getValue?.declaration.async, true)
  assert.equal(getValue?.node.async, false)
  assert.match(code, /inox_async_task_getValue_frame/)
  assert.match(code, /inox_async_task_getValue_start/)
})


test('drives C async runtime headers from target-neutral IR requirements', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )
  const code = emitCFromIr({
    ...result.ir,
    runtimeRequirements: ['async-runtime']
  })
  const withoutAsyncRuntime = emitCFromIr({
    ...result.ir,
    runtimeRequirements: []
  })

  assert.match(code, /#include "inox\/loop\.h"/)
  assert.match(code, /#include "inox\/promise\.h"/)
  assert.match(code, /#include "inox\/time\.h"/)
  assert.match(code, /static inox_allocator inox_default_allocator = \{/)
  assert.doesNotMatch(withoutAsyncRuntime, /#include "inox\/loop\.h"/)
  assert.doesNotMatch(withoutAsyncRuntime, /#include "inox\/promise\.h"/)
  assert.doesNotMatch(withoutAsyncRuntime, /#include "inox\/time\.h"/)
})


test('compiles named callback function values to C', () => {
  const source = `function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

export function main(): void {
  const callback: Function = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\);/)
  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\) \{\n {2}callback\(\);/)
  assert.match(c.code, /void \(\*const callback\)\(void\) = hello;/)
  assert.match(c.code, /run\(callback\);/)
})


test('compiles typed no-argument callback aliases to C', () => {
  const source = `type Done = () => void;

function run(callback: Done): void {
  callback()
}

function hello(): void {
  console.log('typed')
}

export function main(): void {
  const callback: Done = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\);/)
  assert.match(c.code, /void \(\*const callback\)\(void\) = hello;/)
})


test('compiles typed callback aliases with number parameters to C', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

function hello(value: number): void {
  console.log(value)
}

export function main(): void {
  const callback: NumberCallback = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(double\)\);/)
  assert.match(c.code, /void run\(void \(\*callback\)\(double\)\) \{\n {2}callback\(7\);/)
  assert.match(c.code, /void \(\*const callback\)\(double\) = hello;/)
})


test('lowers function-typed object fields to C function pointer parameters', () => {
  const source = `type Deps = {
  add(a: number, b: number): number
}

function add(a: number, b: number): number {
  return a + b
}

function run(deps: Deps): number {
  return deps.add(2, 3)
}

export function main(): void {
  const deps = { add: add }
  console.log(run(deps))
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double run\(inox_value deps, double \(\*inox_objfn_deps_add\)\(double, double\)\);/)
  assert.match(c.code, /inox_return = inox_objfn_deps_add\(2, 3\);/)
  assert.match(c.code, /double \(\*const inox_objfn_deps_add\)\(double, double\) = add;/)
  assert.match(c.code, /run\(deps, inox_objfn_deps_add\)/)
  assert.doesNotMatch(c.code, /inox_callback_call/)
})

test('lowers colon function-typed object fields to C function pointer parameters', () => {
  const source = `type Deps = {
  add: (a: number, b: number) => number
}

function add(a: number, b: number): number {
  return a + b
}

function run(deps: Deps): number {
  return deps.add(2, 3)
}

export function main(): void {
  const deps = { add: add }
  console.log(run(deps))
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double run\(inox_value deps, double \(\*inox_objfn_deps_add\)\(double, double\)\);/)
  assert.match(c.code, /inox_return = inox_objfn_deps_add\(2, 3\);/)
  assert.match(c.code, /run\(deps, inox_objfn_deps_add\)/)
  assert.doesNotMatch(c.code, /INOX_C_CALL_EXPR/)
})

test('lowers newline-separated colon function-typed object fields', () => {
  const source = `type Deps = {
  next: (value: number) => number
  add: (a: number, b: number) => number
}

function next(value: number): number {
  return value + 1
}

function add(a: number, b: number): number {
  return a + b
}

function run(deps: Deps): number {
  return deps.add(deps.next(1), 3)
}

export function main(): void {
  const deps = { next: next, add: add }
  console.log(run(deps))
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /double run\(inox_value deps, double \(\*inox_objfn_deps_next\)\(double\), double \(\*inox_objfn_deps_add\)\(double, double\)\);/
  )
  assert.match(c.code, /inox_objfn_deps_add\(inox_objfn_deps_next\(1\), 3\)/)
  assert.match(c.code, /run\(deps, inox_objfn_deps_next, inox_objfn_deps_add\)/)
  assert.doesNotMatch(c.code, /INOX_C_CALL_EXPR/)
})

test('lowers inline arrow object function fields with contextual types', () => {
  const source = `type Deps = {
  add: (a: number, b: number) => number
}

function run(deps: Deps): number {
  return deps.add(2, 3)
}

export function main(): void {
  const deps: Deps = {
    add: (a, b) => a + b
  }
  console.log(run(deps))
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /static double inox_callback_arrow_0\(double a, double b\);/)
  assert.match(c.code, /inox_return = \(a \+ b\);/)
  assert.match(c.code, /return inox_return;/)
  assert.match(c.code, /double \(\*const inox_objfn_deps_add\)\(double, double\) = inox_callback_arrow_0;/)
  assert.match(c.code, /run\(deps, inox_objfn_deps_add\)/)
  assert.doesNotMatch(c.code, /INOX_C_FUNCTION_VALUE/)
})

test('lowers accessor-returned function-typed object fields to C function pointer parameters', () => {
  const source = `type MathDeps = {
  add(a: number): number
}

type Context = {
  math: MathDeps
}

function deps(context: Context): MathDeps {
  return context.math
}

function add(a: number): number {
  return a + 1
}

function run(context: Context): number {
  return deps(context).add(2)
}

export function main(): void {
  const math = { add: add }
  const context: Context = { math: math }
  console.log(run(context))
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double run\(inox_value context, double \(\*inox_objfn_context_math_add\)\(double\)\);/)
  assert.match(c.code, /inox_return = inox_objfn_context_math_add\(2\);/)
  assert.match(c.code, /run\(context, inox_objfn_context_math_add\)/)
  assert.doesNotMatch(c.code, /INOX_C_CALL_EXPR/)
})


test('lowers block accessor-returned function-typed object fields to C function pointer parameters', () => {
  const source = `type MathDeps = {
  add(a: number): number
}

type Context = {
  math: MathDeps
}

function deps(context: Context): MathDeps {
  const math = context.math

  if (math != null) {
    return math
  }

  return context.math
}

function add(a: number): number {
  return a + 1
}

function run(context: Context): number {
  return deps(context).add(2)
}

export function main(): void {
  const math = { add: add }
  const context: Context = { math: math }
  console.log(run(context))
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double run\(inox_value context, double \(\*inox_objfn_context_math_add\)\(double\)\);/)
  assert.match(c.code, /inox_return = inox_objfn_context_math_add\(2\);/)
  assert.match(c.code, /run\(context, inox_objfn_context_math_add\)/)
  assert.doesNotMatch(c.code, /INOX_C_CALL_EXPR/)
})


test('compiles typed callback aliases with string parameters through the C callback ABI', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(inox_value callback\);/)
  assert.match(
    c.code,
    /static inox_status inox_callback_hello_0\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\);/
  )
  assert.match(
    c.code,
    /if \(inox_callback_new\(&inox_default_allocator, inox_callback_hello_0, 0, 0, &callback\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /inox_value inox_callback_args_\d+\[\] = \{ inox_value_\d+ \};/)
  assert.match(
    c.code,
    /if \(inox_callback_call\(callback, inox_callback_args_\d+, 1, &inox_callback_out_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
})


test('drives C callback wrapper collection from target-neutral IR top-level items', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.match(
    result.code,
    /static inox_status inox_callback_hello_0\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\);/
  )
  const mainIndex = result.ir.body.findIndex((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const withoutMainBodyCallbacks = emitCFromIr({
    ...result.ir,
    body: result.ir.body.map((item, index) =>
      index === mainIndex
        ? {
            ...item,
            body: []
          }
        : item
    )
  })

  assert.doesNotMatch(withoutMainBodyCallbacks, /inox_callback_hello_0/)
  assert.doesNotMatch(
    emitCFromIr({
      ...result.ir,
      body: []
    }),
    /inox_callback_hello_0/
  )
})


test('compiles typed callback aliases with object parameters through the C callback ABI', () => {
  const source = `type Person = {
  name: string
};

type PersonCallback = (value: Person) => void;

function run(callback: PersonCallback, person: Person): void {
  callback(person)
}

function hello(value: Person): void {
  console.log(value.name)
}

export function main(): void {
  const person: Person = {
    name: 'Ada'
  }
  const callback: PersonCallback = hello
  run(callback, person)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(inox_value callback, inox_value person\);/)
  assert.match(c.code, /if \(args\[0\]\.tag != INOX_TAG_OBJECT \|\| args\[0\]\.as\.ref == 0\) return INOX_ERR_TYPE;/)
  assert.match(c.code, /inox_value inox_callback_args_\d+\[\] = \{ person \};/)
  assert.match(c.code, /if \(inox_object_get_known\(value, 0, &inox_log_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/)
})


test('compiles capturing runtime callback arrows to C callback context', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Ada')
}

export function main(): void {
  const prefix = 'hello'
  const callback: StringCallback = (value: string) => {
    console.log(prefix, value)
  }
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /typedef struct inox_callback_context_\d+ \{\n {2}const char \*prefix;\n\} inox_callback_context_\d+;/
  )
  assert.match(c.code, /static void inox_callback_context_\d+_finalize\(void \*context\);/)
  assert.match(
    c.code,
    /static inox_status inox_callback_arrow_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(c.code, /inox_callback_context_\d+\* captured = \(inox_callback_context_\d+\*\)(?:inox_)?context;/)
  assert.match(c.code, /const char \*prefix = captured->prefix;/)
  assert.match(
    c.code,
    /inox_callback_context_\d+\* inox_callback_ctx_\d+ = inox_default_alloc\(0, sizeof\(inox_callback_context_\d+\), _Alignof\(inox_callback_context_\d+\)\);/
  )
  assert.match(c.code, /inox_callback_ctx_\d+->prefix = prefix;/)
  assert.match(
    c.code,
    /if \(inox_callback_new\(&inox_default_allocator, inox_callback_arrow_\d+, inox_callback_ctx_\d+, inox_callback_context_\d+_finalize, &callback\) != INOX_OK\) \{/
  )
})


test('compiles runtime callback arrows with retained runtime captures', () => {
  const source = `type User = {
  name: string
}

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Grace')
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const callback: StringCallback = (value: string) => {
    console.log(name, user.name, value)
  }
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /typedef struct inox_callback_context_\d+ \{\n {2}inox_value name;\n {2}inox_value user;\n\} inox_callback_context_\d+;/
  )
  assert.match(
    c.code,
    /inox_callback_context_\d+\* captured = \(inox_callback_context_\d+\*\)context;\n {2}inox_release\(captured->name\);\n {2}inox_release\(captured->user\);/
  )
  assert.match(c.code, /inox_string \*name = \(inox_string \*\)captured->name\.as\.ref;/)
  assert.match(c.code, /inox_value user = captured->user;/)
  assert.match(
    c.code,
    /inox_callback_ctx_\d+->name\.tag = INOX_TAG_STRING;\n {2}inox_callback_ctx_\d+->name\.as\.ref = \(inox_ref \*\)&name->header;\n {2}inox_retain\(inox_callback_ctx_\d+->name\);/
  )
  assert.match(c.code, /inox_callback_ctx_\d+->user = user;\n {2}inox_retain\(inox_callback_ctx_\d+->user\);/)
})


test('checks typed callback argument counts', () => {
  assertDiagnostic(
    `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback()
}
`,
    'INOX_ARG_COUNT',
    {
      target: 'c'
    }
  )
})


test('compiles non-capturing inline C callback values to plain functions', () => {
  const source = `function run(callback: Function): void {
  callback()
}

export function main(): void {
  run(() => {
    console.log('inline')
  })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /static void inox_callback_arrow_\d+\(void\);/)
  assert.match(c.code, /static void inox_callback_arrow_\d+\(void\) \{\n {2}printf\("%s\\n", "inline"\);/)
  assert.match(c.code, /run\(inox_callback_arrow_\d+\);/)
})


test('promotes capturing plain C callback values to runtime callbacks', () => {
  const source = `function run(callback: Function): void {
  callback()
}

export function main(): void {
  const label = 'captured'
  run(() => {
    console.log(label)
  })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(inox_value callback\);/)
  assert.match(c.code, /if \(callback\.tag != INOX_TAG_FUNCTION \|\| callback\.as\.ref == 0\)\s+goto inox_cleanup;/)
  assert.match(
    c.code,
    /typedef struct inox_callback_context_\d+ \{\n {2}const char \*label;\n\} inox_callback_context_\d+;/
  )
  assert.match(
    c.code,
    /static inox_status inox_callback_arrow_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(
    c.code,
    /if \(inox_callback_call\(callback, 0, 0, &inox_callback_out_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    c.code,
    /if \(inox_callback_new\(&inox_default_allocator, inox_callback_arrow_\d+, inox_callback_ctx_\d+, inox_callback_context_\d+_finalize, &inox_callback_\d+\) != INOX_OK\) \{/
  )
  assert.match(c.code, /run\(inox_callback_\d+\);/)
})


test('promotes capturing number callback values to runtime callbacks', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

export function main(): void {
  const offset = 5
  run((value: number) => {
    console.log(value + offset)
  })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(inox_value callback\);/)
  assert.match(c.code, /if \(callback\.tag != INOX_TAG_FUNCTION \|\| callback\.as\.ref == 0\)\s+goto inox_cleanup;/)
  assert.match(c.code, /inox_value inox_callback_args_\d+\[\] = \{ inox_number_value\(7\) \};/)
  assert.match(
    c.code,
    /if \(inox_callback_call\(callback, inox_callback_args_\d+, 1, &inox_callback_out_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /double value = args\[0\]\.as\.number;/)
  assert.match(c.code, /double offset = captured->offset;/)
})


test('promotes captured C callback variables to runtime callbacks', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: Function): void {
  callback()
}

function runNumber(callback: NumberCallback): void {
  callback(7)
}

export function main(): void {
  const label = 'captured'
  const offset = 5
  const callback: Function = () => {
    console.log(label)
  }
  const numberCallback: NumberCallback = (value: number) => {
    console.log(value + offset)
  }
  callback()
  run(callback)
  runNumber(numberCallback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(inox_value callback\);/)
  assert.match(c.code, /void runNumber\(inox_value callback\);/)
  assert.match(c.code, /inox_value callback = inox_undefined_value\(\);/)
  assert.match(c.code, /inox_value numberCallback = inox_undefined_value\(\);/)
  assert.match(
    c.code,
    /if \(inox_callback_call\(callback, 0, 0, &inox_callback_out_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(c.code, /run\(callback\);/)
  assert.match(c.code, /runNumber\(numberCallback\);/)
})


test('rejects delayed callback storage in C with stable diagnostics', () => {
  assertDiagnostic(
    `type Task = () => void;

function hello(): void {
  console.log('hello')
}

export function main(): void {
  const tasks: Task[] = [hello]
  const task = tasks[0]
  task()
}
`,
    'INOX_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `type Task = () => void;

function hello(): void {
  console.log('hello')
}

export function main(): void {
  const tasks: Map<string, Task> = new Map([['hello', hello]])
  const task: Task | null = tasks.get('hello')
  task?.()
}
`,
    'INOX_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `type Task = () => void;

function makeTask(): Task {
  return () => {
    console.log('hello')
  }
}

export function main(): void {
  const task = makeTask()
  task()
}
`,
    'INOX_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )
})


test('boxes mutable numeric C callback captures', () => {
  const source = `function run(callback: Function): void {
  callback()
}

export function main(): void {
  let count = 0
  const callback: Function = () => {
    count = count + 1
    console.log(count)
  }
  run(callback)
  console.log(count)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double \*count = 0;/)
  assert.match(c.code, /count = inox_default_alloc\(0, sizeof\(double\), _Alignof\(double\)\);/)
  assert.match(c.code, /\*count = 0;/)
  assert.match(c.code, /double \*count = captured->count;/)
  assert.match(c.code, /\(\*count\) = \(\(\*count\) \+ 1\);/)
  assert.match(c.code, /run\(callback\);/)
  assert.match(c.code, /printf\("%g\\n", \(\(double\)\(\*count\)\)\);/)
  assert.match(c.code, /if \(count != 0\) inox_default_free\(0, count, sizeof\(double\), _Alignof\(double\)\);/)
})


test('boxes mutable numeric C callback parameter captures', () => {
  const source = `function run(seed: number): void {
  const callback: Function = () => {
    seed = seed + 1
    console.log(seed)
  }
  callback()
  console.log(seed)
}

export function main(): void {
  run(1)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(double inox_param_seed\);/)
  assert.match(c.code, /double \*seed = 0;/)
  assert.match(c.code, /seed = inox_default_alloc\(0, sizeof\(double\), _Alignof\(double\)\);/)
  assert.match(c.code, /\*seed = inox_param_seed;/)
  assert.match(c.code, /double \*seed = captured->seed;/)
  assert.match(c.code, /\(\*seed\) = \(\(\*seed\) \+ 1\);/)
  assert.match(c.code, /if \(seed != 0\) inox_default_free\(0, seed, sizeof\(double\), _Alignof\(double\)\);/)
})


test('boxes mutable string and object C callback captures', () => {
  const source = `type Person = {
  name: string
}

function run(callback: Function): void {
  callback()
}

export function main(): void {
  let label = 'captured'
  let person: Person = { name: 'Ada' }
  const callback: Function = () => {
    label = label + '!'
    person.name = label
    console.log(label, person.name)
  }
  run(callback)
  console.log(label, person.name)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /typedef struct inox_callback_context_\d+ \{\n {2}inox_value \*label;\n {2}inox_value \*person;\n\} inox_callback_context_\d+;/
  )
  assert.match(c.code, /inox_value \*label = 0;/)
  assert.match(c.code, /inox_value \*person = 0;/)
  assert.match(c.code, /inox_value \*label = captured->label;/)
  assert.match(c.code, /inox_value \*person = captured->person;/)
  assert.match(c.code, /inox_value inox_box_value_\d+ = inox_value_\d+;/)
  assert.match(
    c.code,
    /inox_retain\(inox_box_value_\d+\);\n {2}inox_release\(\*label\);\n {2}\*label = inox_box_value_\d+;/
  )
  assert.match(c.code, /inox_object_set_known\(\(\*person\), 0, \(\*label\)\)/)
  assert.match(
    c.code,
    /if \(label != 0\) \{\n {4}inox_release\(\*label\);\n {4}inox_default_free\(0, label, sizeof\(inox_value\), _Alignof\(inox_value\)\);\n {2}\}/
  )
  assert.match(
    c.code,
    /if \(person != 0\) \{\n {4}inox_release\(\*person\);\n {4}inox_default_free\(0, person, sizeof\(inox_value\), _Alignof\(inox_value\)\);\n {2}\}/
  )
})


test('lowers C optional calls over nullable callbacks', () => {
  const result = compileSource(
    `type Named = (name: string) => void;

function maybeLog(callback: Function | null): void {
  callback?.()
}

function maybeNamed(callback: Named | null): void {
  callback?.('Ada')
}

function hello(): void {
  console.log('hello')
}

function named(name: string): void {
  console.log(name)
}

export function main(): void {
  const callback: Function | null = hello
  callback?.()
  maybeLog(null)
  maybeLog(hello)

  let namedCallback: Named | null = null
  namedCallback?.('skip')
  namedCallback = named
  namedCallback?.('Grace')
  maybeNamed(named)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void maybeLog\(inox_value callback\)/)
  assert.match(result.code, /void maybeNamed\(inox_value callback\)/)
  assert.match(result.code, /if \(callback\.tag != INOX_TAG_NULL\) \{/)
  assert.match(result.code, /inox_callback_call\(callback, 0, 0, &inox_callback_out_\d+\)/)
  assert.match(result.code, /inox_callback_call\(namedCallback, inox_callback_args_\d+, 1, &inox_callback_out_\d+\)/)
  assert.match(result.code, /maybeLog\(inox_null_value\(\)\);/)
  assert.match(result.code, /namedCallback = inox_nullable_value_\d+;/)

  assertDiagnostic(
    `export function main(): void {
  const value = 1
  value?.()
}
`,
    'INOX_C_OPTIONAL_CHAINING',
    {
      target: 'c'
    }
  )
})


test('lowers C optional call results over nullable scalar callbacks', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Ready = () => boolean;

function addOne(value: number): number {
  return value + 1
}

function isReady(): boolean {
  return true
}

function printValues(score: Score | null, ready: Ready | null): void {
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}

export function main(): void {
  printValues(addOne, isReady)
  printValues(null, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_callback_addOne_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(result.code, /\*out = inox_number_value\(addOne\(args\[0\]\.as\.number\)\);/)
  assert.match(result.code, /\*out = inox_bool_value\(\(isReady\(\)\) != 0\);/)
  assert.match(result.code, /inox_optional_call_\d+ = inox_null_value\(\);/)
  assert.match(result.code, /inox_callback_call\(score, inox_callback_args_\d+, 1, &inox_optional_call_\d+\)/)
  assert.match(result.code, /inox_callback_call\(ready, 0, 0, &inox_optional_call_\d+\)/)
})


test('lowers C optional call results over nullable scalar arrow callbacks', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Ready = () => boolean;

export function main(): void {
  const bonus = 3
  const score: Score | null = (value: number) => value + bonus
  const ready: Ready | null = () => bonus === 3
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_callback_arrow_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(result.code, /\*out = inox_number_value\(\(value \+ bonus\)\);/)
  assert.match(result.code, /\*out = inox_bool_value\(\(\(bonus == 3\)\) != 0\);/)
  assert.match(result.code, /inox_callback_call\(score, inox_callback_args_\d+, 1, &inox_optional_call_\d+\)/)
  assert.match(result.code, /inox_callback_call\(ready, 0, 0, &inox_optional_call_\d+\)/)
})


test('lowers C optional call results over nullable scalar block arrow callbacks', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Ready = () => boolean;

export function main(): void {
  const bonus = 3
  const score: Score | null = (value: number) => {
    const doubled = value * 2
    if (doubled > 4) {
      return doubled + bonus
    }

    return bonus
  }
  const ready: Ready | null = () => {
    if (bonus === 3) {
      return true
    }

    return false
  }
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_callback_arrow_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(result.code, /\(\*out\) = inox_number_value\(\(doubled \+ bonus\)\);/)
  assert.match(result.code, /\(\*out\) = inox_bool_value\(\(1\) != 0\);/)
  assert.match(result.code, /goto inox_callback_cleanup;/)
  assert.match(result.code, /inox_callback_cleanup:/)
  assert.match(result.code, /inox_callback_call\(score, inox_callback_args_\d+, 1, &inox_optional_call_\d+\)/)
  assert.match(result.code, /inox_callback_call\(ready, 0, 0, &inox_optional_call_\d+\)/)
})


test('lowers C runtime callback returns through finally before callback cleanup', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Name = () => string;

export function main(): void {
  const score: Score | null = (value: number) => {
    try {
      return value + 3
    } finally {
      console.log('score finally', value)
    }
  }

  const name: Name | null = () => {
    try {
      return 'Ada'
    } finally {
      console.log('name finally')
    }
  }

  const value: number | null = score?.(4)
  const text: string | null = name?.()
  console.log(value ?? 0, text ?? 'missing')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_callback_arrow_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\) \{\n {2}\(void\)(?:inox_)?context;\n {2}if \(out == 0 \|\| arg_count != 1 \|\| args == 0\) return INOX_ERR_TYPE;\n {2}\*out = inox_undefined_value\(\);\n {2}if \(args\[0\]\.tag != INOX_TAG_NUMBER\) return INOX_ERR_TYPE;\n {2}double value = args\[0\]\.as\.number;\n {2}int inox_return_active = 0;/
  )
  assert.match(
    result.code,
    /\(\*out\) = inox_number_value\(\(value \+ 3\)\);\n\s+inox_return_active = 1;\n\s+goto inox_try_\d+_finally;/
  )
  assert.match(
    result.code,
    /printf\("%s %g\\n", "score finally", .*value.*\);\n\s+if \(inox_error_active\) return INOX_ERR_TYPE;\n\s+if \(inox_return_active\) goto inox_callback_cleanup;/
  )
  assert.match(
    result.code,
    /\(\*out\) = inox_value_\d+;\n\s+if \(\(\*out\)\.tag != INOX_TAG_STRING \|\| \(\*out\)\.as\.ref == 0\) return INOX_ERR_TYPE;\n\s+inox_retain\(\(\*out\)\);\n\s+inox_return_active = 1;\n\s+goto inox_try_\d+_finally;/
  )
  assert.match(
    result.code,
    /inox_callback_cleanup:\n {2}inox_release\(inox_value_\d+\);\n {2}inox_release\(inox_error\);\n {2}return INOX_OK;/
  )
})


test('lowers C optional call results over nullable string callbacks', () => {
  const result = compileSource(
    `type Name = () => string;

function getName(): string {
  return 'Ada'
}

function printName(callback: Name | null): void {
  const value: string | null = callback?.()
  console.log(value ?? 'missing')
}

export function main(): void {
  printName(getName)
  printName(null)

  const arrow: Name | null = () => 'Grace'
  printName(arrow)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_callback_getName_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(result.code, /\*out = getName\(\);/)
  assert.match(result.code, /\(\*out\) = inox_value_\d+;/)
  assert.match(result.code, /inox_retain\(\(\*out\)\);/)
  assert.match(result.code, /inox_callback_call\(callback, 0, 0, &inox_optional_call_\d+\)/)
  assert.match(result.code, /inox_optional_call_\d+\.tag != INOX_TAG_STRING \|\| inox_optional_call_\d+\.as\.ref == 0/)
})


test('lowers C optional call results over nullable object callbacks', () => {
  const result = compileSource(
    `type User = {
  name: string,
  id: number
}
type MakeUser = () => User;

function getUser(): User {
  return { name: 'Ada', id: 7 }
}

function printUser(callback: MakeUser | null): void {
  const user: User | null = callback?.()
  const name: string | null = user?.name
  const id: number | null = user?.id
  console.log(name ?? 'missing', id ?? 0)
}

export function main(): void {
  printUser(getUser)
  printUser(null)

  const arrow: MakeUser | null = () => {
    return { name: 'Grace', id: 9 }
  }
  printUser(arrow)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value getUser\(void\) \{/)
  assert.match(
    result.code,
    /static inox_status inox_callback_getUser_\d+\(void \*(?:inox_)?context, const inox_value \*args, size_t arg_count, inox_value \*out\)/
  )
  assert.match(result.code, /\*out = getUser\(\);/)
  assert.match(result.code, /\(\*out\) = inox_object_\d+;/)
  assert.match(result.code, /inox_callback_call\(callback, 0, 0, &inox_optional_call_\d+\)/)
  assert.match(result.code, /inox_optional_call_\d+\.tag != INOX_TAG_OBJECT \|\| inox_optional_call_\d+\.as\.ref == 0/)
  assert.match(result.code, /inox_object_get_known\(user, 0, &inox_optional_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(user, 1, &inox_optional_value_\d+\)/)
})


test('compiles awaited async function calls to C', () => {
  const source = `async function getValue(): Promise<number> {
  return Promise.resolve(2)
}

async function getText(): Promise<string> {
  return Promise.resolve('ok')
}

export async function main(): Promise<void> {
  const text = await getText()
  const value = await getValue()
  console.log(text)
  console.log(value)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(
    c.ir.syntaxFeatures.map((item) => item.feature),
    ['async-function', 'async-function', 'async-function']
  )

  assert.match(c.code, /double getValue\(void\)/)
  assert.match(c.code, /inox_value getText\(void\)/)
  assert.match(c.code, /inox_return = inox_await_value_\d+\.as\.number;/)
  assert.match(c.code, /inox_return = inox_await_value_\d+;/)
  assert.match(c.code, /inox_await_value_\d+ = inox_number_value\(getValue\(\)\);/)
  assert.match(c.code, /inox_await_value_\d+ = getText\(\);/)
})


test('lowers async function calls as C Promise values', () => {
  const result = compileSource(
    `async function getValue(): Promise<number> {
  return Promise.resolve(3)
}

export async function main(): Promise<void> {
  const promise = getValue()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_promise \*promise = 0;/)
  assert.match(
    result.code,
    /if \(inox_promise_resolved\(&inox_loop, inox_number_value\(getValue\(\)\), &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /while \(inox_promise_get_state\(promise\) == INOX_PROMISE_PENDING && inox_loop_has_work\(&inox_loop\)\) \{/
  )
  const managed = compileSource(
    `async function getText(): Promise<string> {
  return Promise.resolve('ok')
}

export async function main(): Promise<void> {
  const promise = getText()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(managed.code, /inox_value inox_async_value_\d+ = inox_undefined_value\(\);/)
  assert.match(managed.code, /inox_async_value_\d+ = getText\(\);/)
  assert.match(
    managed.code,
    /if \(inox_async_value_\d+\.tag != INOX_TAG_STRING \|\| inox_async_value_\d+\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(
    managed.code,
    /if \(inox_promise_resolved\(&inox_loop, inox_async_value_\d+, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    managed.code,
    /inox_release\(inox_async_value_\d+\);\n {2}inox_async_value_\d+ = inox_undefined_value\(\);/
  )

  const throwing = compileSource(
    `async function failText(): Promise<string> {
  throw 'fail'
}

export async function main(): Promise<void> {
  const promise = failText()

  try {
    await promise
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(throwing.code, /inox_status failText\(inox_value \*inox_out, inox_value \*inox_error_out\);/)
  assert.match(throwing.code, /inox_value inox_async_result_\d+ = inox_undefined_value\(\);/)
  assert.match(throwing.code, /inox_status inox_async_status_\d+ = failText\(&inox_async_result_\d+, &inox_error\);/)
  assert.match(
    throwing.code,
    /if \(inox_async_status_\d+ == INOX_ERR_THROW\) \{\n {4}if \(inox_promise_rejected\(&inox_loop, inox_error, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(throwing.code, /inox_release\(inox_error\);\n {4}inox_error = inox_undefined_value\(\);/)
  assert.match(
    throwing.code,
    /if \(inox_async_result_\d+\.tag != INOX_TAG_STRING \|\| inox_async_result_\d+\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(
    throwing.code,
    /if \(inox_promise_resolved\(&inox_loop, inox_async_result_\d+, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    throwing.code,
    /inox_release\(inox_async_result_\d+\);\n {4}inox_async_result_\d+ = inox_undefined_value\(\);/
  )
})


test('passes event loop into Promise-returning class methods', () => {
  const result = compileSource(
    `class SourceHost {
  readFile(path: string): Promise<string> {
    return Promise.resolve(path)
  }
}

const host = new SourceHost()
const promise = host.readFile('ok')
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_promise\* inox_method_SourceHost_readFile\(inox_loop\* inox_loop, inox_value this, inox_value inox_param_path\)/
  )
  assert.match(result.code, /inox_promise_resolved\(inox_loop, inox_value_\d+, &inox_return\)/)
  assert.match(result.code, /inox_method_SourceHost_readFile\(&inox_loop, host, inox_value_\d+\)/)
})


test('lowers simple async functions with await to C task frames', () => {
  const result = compileSource(
    `async function compute(): Promise<number> {
  const value = await Promise.resolve(2)

  return Promise.resolve(value + 3)
}

export async function main(): Promise<void> {
  const promise = compute()
  console.log(await compute())
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /typedef struct inox_async_task_compute_frame \{/)
  assert.match(result.code, /inox_promise \*awaited;/)
  assert.match(
    result.code,
    /static inox_status inox_async_task_compute_start\(inox_loop \*inox_loop, inox_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_compute_resume\(void \*context, inox_value inox_value_input\);/
  )
  assert.match(result.code, /status = inox_promise_new\(inox_loop, &frame->awaited\);/)
  assert.match(
    result.code,
    /status = inox_promise_then\(frame->awaited, inox_async_task_compute_resume, inox_async_task_compute_reject, frame, inox_async_task_compute_finalize\);/
  )
  assert.match(result.code, /status = inox_promise_resolve\(frame->awaited, inox_number_value\(2\)\);/)
  assert.match(result.code, /frame->local_value = inox_value_input\.as\.number;/)
  assert.match(result.code, /double value = frame->local_value;/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(value \+ 3\)\)\);/)
  assert.match(
    result.code,
    /if \(inox_async_task_compute_start\(&inox_loop, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_async_task_compute_start\(&inox_loop, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.doesNotMatch(result.code, /inox_promise_resolved\(&inox_loop, inox_number_value\(compute\(\)\), &promise\)/)
  assert.doesNotMatch(result.code, /inox_await_value_\d+ = inox_number_value\(compute\(\)\);/)
})


test('lowers async task frame parameters to C frame fields', () => {
  const result = compileSource(
    `async function addLater(input: number, delta: number): Promise<number> {
  const value = await Promise.resolve(input)

  return Promise.resolve(value + delta)
}

export async function main(): Promise<void> {
  console.log(await addLater(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double param_input;/)
  assert.match(result.code, /double param_delta;/)
  assert.match(
    result.code,
    /static inox_status inox_async_task_addLater_start\(inox_loop \*inox_loop, double inox_arg_input, double inox_arg_delta, inox_promise \*\* out\);/
  )
  assert.match(result.code, /double input = frame->param_input;/)
  assert.match(result.code, /double delta = frame->param_delta;/)
  assert.match(result.code, /frame->param_input = inox_arg_input;/)
  assert.match(result.code, /frame->param_delta = inox_arg_delta;/)
  assert.match(result.code, /status = inox_promise_resolve\(frame->awaited, inox_number_value\(input\)\);/)
  assert.match(result.code, /double input = frame->param_input;/)
  assert.match(result.code, /double delta = frame->param_delta;/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(value \+ delta\)\)\);/)
  assert.match(
    result.code,
    /if \(inox_async_task_addLater_start\(&inox_loop, 2, 4, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.doesNotMatch(
    result.code,
    /inox_promise_resolved\(&inox_loop, inox_number_value\(addLater\(2, 4\)\), &inox_promise_\d+\)/
  )
})


test('lowers async task frame await over local Promise variables to C', () => {
  const result = compileSource(
    `async function addLater(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input)
  const value = await pending

  return Promise.resolve(value + delta)
}

export async function main(): Promise<void> {
  console.log(await addLater(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /status = inox_promise_resolved\(inox_loop, inox_number_value\(input\), &frame->awaited\);/)
  assert.match(
    result.code,
    /status = inox_promise_then\(frame->awaited, inox_async_task_addLater_resume, inox_async_task_addLater_reject, frame, inox_async_task_addLater_finalize\);/
  )
  assert.doesNotMatch(result.code, /status = inox_promise_new\(inox_loop, &frame->awaited\);/)
  assert.doesNotMatch(result.code, /status = inox_promise_resolve\(frame->awaited, inox_number_value\(input\)\);/)
  assert.match(result.code, /double input = frame->param_input;/)
  assert.match(result.code, /double delta = frame->param_delta;/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(value \+ delta\)\)\);/)
})


test('lowers boolean async task frames to C', () => {
  const result = compileSource(
    `async function flip(flag: boolean): Promise<boolean> {
  const value = await Promise.resolve(flag)

  return Promise.resolve(!value)
}

export async function main(): Promise<void> {
  console.log(await flip(false))
  console.log(await flip(true))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double param_flag;/)
  assert.match(result.code, /status = inox_promise_resolve\(frame->awaited, inox_bool_value\(\(flag\) != 0\)\);/)
  assert.match(
    result.code,
    /if \(inox_value_input\.tag != INOX_TAG_BOOL\) \{\n {6}inox_status reject_status = inox_promise_reject\(frame->promise, inox_number_value\(\(inox_number\)INOX_ERR_TYPE\)\);\n {6}return reject_status;\n {4}\}/
  )
  assert.match(result.code, /frame->local_value = inox_value_input\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /double value = frame->local_value;/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_bool_value\(\(\(!value\)\) != 0\)\);/)
  assert.match(
    result.code,
    /if \(inox_async_task_flip_start\(&inox_loop, 0, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_async_task_flip_start\(&inox_loop, 1, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
})


test('lowers async task frame await over local Promise chains to C', () => {
  const result = compileSource(
    `async function addChain(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input).then(value => value + 2)
  const value = await pending

  return Promise.resolve(value + delta)
}

export async function main(): Promise<void> {
  console.log(await addChain(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_promise_chain_arrow_\d+\(void \*context, inox_value inox_value_input, inox_value \*out\);/
  )
  assert.match(result.code, /inox_promise \*inox_async_task_source_\d+ = 0;/)
  assert.match(
    result.code,
    /status = inox_promise_resolved\(inox_loop, inox_number_value\(input\), &inox_async_task_source_\d+\);/
  )
  assert.match(
    result.code,
    /status = inox_promise_chain\(inox_async_task_source_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &frame->awaited\);/
  )
  assert.match(result.code, /inox_promise_release\(inox_async_task_source_\d+\);/)
  assert.match(
    result.code,
    /status = inox_promise_then\(frame->awaited, inox_async_task_addChain_resume, inox_async_task_addChain_reject, frame, inox_async_task_addChain_finalize\);/
  )
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(value \+ delta\)\)\);/)
})


test('lowers async task frame await over captured local Promise chains to C', () => {
  const result = compileSource(
    `async function addChain(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input).then(value => value + delta)
  const value = await pending

  return value + delta
}

export async function main(): Promise<void> {
  console.log(await addChain(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_promise_chain_context_\d+ \{\n {2}double delta;\n\} inox_promise_chain_context_\d+;/
  )
  assert.match(result.code, /static void inox_promise_chain_context_\d+_finalize\(void \*context\);/)
  assert.match(
    result.code,
    /inox_promise_chain_context_\d+\* captured = \(inox_promise_chain_context_\d+\*\)context;\n {2}double delta = captured->delta;/
  )
  assert.match(
    result.code,
    /inox_promise_chain_context_\d+\* inox_promise_callback_ctx_\d+ = inox_default_alloc\(0, sizeof\(inox_promise_chain_context_\d+\), _Alignof\(inox_promise_chain_context_\d+\)\);/
  )
  assert.match(result.code, /inox_promise_callback_ctx_\d+->delta = delta;/)
  assert.match(
    result.code,
    /status = inox_promise_chain\(inox_async_task_source_\d+, inox_promise_chain_arrow_\d+, 0, inox_promise_callback_ctx_\d+, inox_promise_chain_context_\d+_finalize, &frame->awaited\);/
  )
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(value \+ delta\)\)\);/)
})


test('lowers async task frame direct return values to C', () => {
  const result = compileSource(
    `async function addLater(input: number, delta: number): Promise<number> {
  const value = await Promise.resolve(input)

  return value + delta
}

export async function main(): Promise<void> {
  console.log(await addLater(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /typedef struct inox_async_task_addLater_frame \{/)
  assert.match(result.code, /status = inox_promise_resolve\(frame->awaited, inox_number_value\(input\)\);/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(value \+ delta\)\)\);/)
  assert.doesNotMatch(result.code, /return Promise\.resolve/)
  assert.doesNotMatch(result.code, /addLater\(2, 4\)/)
})


test('lowers async task frame direct managed return values to C', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value inox_bytes_\d+ = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_bytes_\d+\);[\s\S]*inox_release\(inox_bytes_\d+\);[\s\S]*return status;/
  )
})


test('lowers multiple awaits in async task frames to C state switches', () => {
  const result = compileSource(
    `async function addTwo(input: number, delta: number): Promise<number> {
  const first = await Promise.resolve(input)
  const second = await Promise.resolve(first + delta)

  return first + second
}

export async function main(): Promise<void> {
  console.log(await addTwo(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int state;/)
  assert.match(result.code, /double local_first;/)
  assert.match(result.code, /double local_second;/)
  assert.match(result.code, /switch \(frame->state\) \{/)
  assert.match(result.code, /case 0: \{/)
  assert.match(result.code, /frame->local_first = inox_value_input\.as\.number;/)
  assert.match(result.code, /frame->state = 1;/)
  assert.match(
    result.code,
    /status = inox_promise_then\(frame->awaited, inox_async_task_addTwo_resume, inox_async_task_addTwo_reject, frame, 0\);/
  )
  assert.match(result.code, /status = inox_promise_resolve\(frame->awaited, inox_number_value\(\(first \+ delta\)\)\);/)
  assert.match(result.code, /case 1: \{/)
  assert.match(result.code, /frame->local_second = inox_value_input\.as\.number;/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(first \+ second\)\)\);/)
})


test('lowers async task frame awaits over local async tasks and plain Promise helpers', () => {
  const result = compileSource(
    `async function immediate(input: number): Promise<number> {
  return input
}

function same(input: number): Promise<number> {
  return Promise.resolve(input)
}

async function addLater(input: number): Promise<number> {
  const value = await Promise.resolve(input)

  return value + 1
}

async function compute(input: number): Promise<number> {
  const zero = await immediate(input)
  const first = await same(zero)
  const second = await addLater(first)
  const third = await same(second)

  return third + 1
}

export async function main(): Promise<void> {
  console.log(await compute(2))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_promise \*same\(inox_loop \*inox_loop, double input\);/)
  assert.match(
    result.code,
    /status = inox_promise_resolved\(inox_loop, inox_number_value\(immediate\(input\)\), &frame->awaited\);/
  )
  assert.match(result.code, /frame->state = 1;/)
  assert.match(result.code, /frame->awaited = same\(inox_loop, zero\);/)
  assert.match(result.code, /status = frame->awaited == 0 \? INOX_ERR_TYPE : INOX_OK;/)
  assert.match(result.code, /frame->state = 2;/)
  assert.match(result.code, /status = inox_async_task_addLater_start\(inox_loop, first, &frame->awaited\);/)
  assert.match(result.code, /frame->state = 3;/)
  assert.match(result.code, /frame->awaited = same\(inox_loop, second\);/)
  assert.match(result.code, /return inox_promise_resolve\(frame->promise, inox_number_value\(\(third \+ 1\)\)\);/)
})


test('lowers async task frame awaits over managed immediate async helpers', () => {
  const result = compileSource(
    `import fs from 'node:fs'

async function sameText(input: string): Promise<string> {
  return input
}

async function sameBytes(input: Buffer): Promise<Buffer> {
  return input
}

async function copy(input: string): Promise<string> {
  const text = await sameText(input)
  const bytes: Buffer = await fs.promises.readFile('/tmp/value.bin')
  const copied: Buffer = await sameBytes(bytes)

  return text
}

export async function main(): Promise<void> {
  console.log(await copy('ok'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value inox_async_value_\d+ = sameText\(inox_value_\d+\);/)
  assert.match(
    result.code,
    /if \(inox_async_value_\d+\.tag != INOX_TAG_STRING \|\| inox_async_value_\d+\.as\.ref == 0\) goto inox_start_error;/
  )
  assert.match(result.code, /status = inox_promise_resolved\(inox_loop, inox_async_value_\d+, &frame->awaited\);/)
  assert.match(result.code, /inox_release\(inox_async_value_\d+\);/)
  assert.match(result.code, /inox_start_error:\n {2}inox_promise_release\(\*out\);/)
  assert.match(result.code, /inox_value inox_async_value_\d+ = sameBytes\(bytes\);/)
  assert.match(
    result.code,
    /if \(inox_async_value_\d+\.tag != INOX_TAG_BYTES \|\| inox_async_value_\d+\.as\.ref == 0\) return INOX_ERR_TYPE;/
  )
})


test('lowers async task frame rejected awaits to returned Promise rejections', () => {
  const result = compileSource(
    `function failNumber(): Promise<number> {
  return Promise.reject('task fail')
}

async function compute(): Promise<number> {
  const value = await failNumber()
  const next = await Promise.resolve(value)

  return next
}

async function failDirect(): Promise<number> {
  const value: number = await Promise.reject('direct fail')

  return value
}

export async function main(): Promise<void> {
  try {
    console.log(await compute())
  } catch (error) {
    console.log(error)
  }

  try {
    console.log(await failDirect())
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /frame->awaited = failNumber\(inox_loop\);/)
  assert.match(
    result.code,
    /static inox_status inox_async_task_compute_reject\(void \*context, inox_value inox_error\) \{\n {2}inox_async_task_compute_frame \*frame = \(inox_async_task_compute_frame \*\)context;\n {2}if \(frame == 0 \|\| frame->promise == 0\) return INOX_ERR_TYPE;\n {2}inox_status status = inox_promise_reject\(frame->promise, inox_error\);\n {2}if \(frame->state < 1\) \{\n {4}inox_async_task_compute_finalize\(frame\);\n {2}\}\n {2}return status;\n\}/
  )
  assert.match(result.code, /status = inox_promise_rejected\(inox_loop, inox_reject_value_\d+, &frame->awaited\);/)
  assert.match(
    result.code,
    /status = inox_promise_then\(frame->awaited, inox_async_task_failDirect_resume, inox_async_task_failDirect_reject, frame, inox_async_task_failDirect_finalize\);/
  )
})


test('lowers async task frame try catch finally around awaited promises', () => {
  const result = compileSource(
    `async function recover(): Promise<number> {
  try {
    const value: number = await Promise.reject('inner fail')

    return value
  } catch (error) {
    console.log('caught', error)

    return 7
  } finally {
    console.log('finally recover')
  }
}

async function propagate(): Promise<number> {
  try {
    const value: number = await Promise.reject('outer fail')

    return value
  } finally {
    console.log('finally propagate')
  }
}

export async function main(): Promise<void> {
  console.log(await recover())

  try {
    console.log(await propagate())
  } catch (error) {
    console.log('outer', error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_recover_reject\(void \*context, inox_value inox_error\) \{/
  )
  assert.match(
    result.code,
    /case 0: \{\n {4}if \(inox_error\.tag != INOX_TAG_STRING \|\| inox_error\.as\.ref == 0\) \{/
  )
  assert.match(result.code, /inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;/)
  assert.match(result.code, /printf\("%s %\.\*s\\n", "caught", \(int\)error->len, error->bytes\);/)
  assert.match(result.code, /printf\("%s\\n", "finally recover"\);/)
  assert.match(result.code, /status = inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/)
  assert.match(
    result.code,
    /static inox_status inox_async_task_propagate_reject\(void \*context, inox_value inox_error\) \{[\s\S]*printf\("%s\\n", "finally propagate"\);[\s\S]*status = inox_promise_reject\(frame->promise, inox_error\);/
  )
})


test('lowers nested async task frame try finally finalizers', () => {
  const result = compileSource(
    `async function compute(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return value
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = compute()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_compute_start\(inox_loop \*inox_loop, inox_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_compute_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_compute_reject\(void \*context, inox_value inox_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = inox_promise_reject\(frame->promise, inox_error\);/
  )
})


test('lowers awaited plain Promise-returning calls to C', () => {
  const result = compileSource(
    `function getPromise(): Promise<number> {
  return Promise.resolve(2)
}

export async function main(): Promise<void> {
  const value = await getPromise()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_promise \*getPromise\(inox_loop \*inox_loop\);/)
  assert.match(
    result.code,
    /if \(inox_promise_resolved\(inox_loop, inox_number_value\(2\), &inox_return\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_promise_\d+ = getPromise\(&inox_loop\);/)
  assert.match(
    result.code,
    /while \(inox_promise_get_state\(inox_promise_\d+\) == INOX_PROMISE_PENDING && inox_loop_has_work\(&inox_loop\)\) \{/
  )
  assert.match(
    result.code,
    /if \(inox_promise_get_result\(inox_promise_\d+, &inox_await_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
})


test('lowers plain Promise helpers over rejection and fs to C', () => {
  const result = compileSource(
    `import fs from 'node:fs'

function failPromise(): Promise<string> {
  return Promise.reject('plain fail')
}

function loadText(): Promise<string> {
  return fs.promises.readFile('/tmp/value.txt', 'utf8')
}

export async function main(): Promise<void> {
  try {
    await failPromise()
  } catch (error) {
    console.log(error)
  }

  const text = await loadText()
  console.log(text)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_promise \*failPromise\(inox_loop \*inox_loop\);/)
  assert.match(
    result.code,
    /if \(inox_promise_rejected\(inox_loop, inox_value_\d+, &inox_return\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_promise \*loadText\(inox_loop \*inox_loop\);/)
  assert.match(
    result.code,
    /if \(inox_fs_read_file\(inox_loop, "\/tmp\/value\.txt", 14, &inox_return\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_promise_\d+ = failPromise\(&inox_loop\);/)
  assert.match(result.code, /goto inox_try_\d+_catch;/)
  assert.match(result.code, /inox_promise_\d+ = loadText\(&inox_loop\);/)
})


test('reports unhandled owned Promise rejections from generated C main', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  Promise.reject('boom')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static int inox_unhandled_rejection = 0;/)
  assert.match(
    result.code,
    /if \(inox_promise_\d+ != 0 && inox_promise_is_unhandled_rejection\(inox_promise_\d+\)\) \{\n {4}fprintf\(stderr, "Unhandled Promise rejection\\n"\);\n {4}inox_unhandled_rejection = 1;\n {2}\}/
  )
  assert.match(result.code, /return inox_unhandled_rejection == 0 \? \(int\)inox_return : 1;/)
})


test('lowers first C async await slice over Promise.resolve and fs promises', () => {
  const result = compileSource(
    `import fs from 'node:fs'

async function loadText(): Promise<string> {
  return fs.promises.readFile('/tmp/out.txt', 'utf8')
}

export async function main(): Promise<void> {
  const promise = Promise.resolve(2)
  const value = await promise
  console.log(await Promise.resolve('ok'))
  console.log(value)
  await fs.promises.writeFile('/tmp/out.txt', 'saved')
  const loaded = loadText()
  const text = await fs.promises.readFile('/tmp/out.txt', 'utf8')
  console.log(await loaded)
  console.log(text)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_value loadText\(void\);/)
  assert.match(result.code, /void inox_main\(void\)/)
  assert.match(result.code, /inox_promise \*promise = 0;/)
  assert.match(
    result.code,
    /if \(inox_promise_resolved\(&inox_loop, inox_number_value\(2\), &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /while \(inox_promise_get_state\(promise\) == INOX_PROMISE_PENDING && inox_loop_has_work\(&inox_loop\)\) \{/
  )
  assert.match(
    result.code,
    /if \(inox_promise_get_result\(promise, &inox_await_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_resolved\(&inox_loop, inox_value_\d+, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_fs_write_file\(&inox_loop, "\/tmp\/out\.txt", 12, "saved", 5, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_fs_read_file\(&inox_loop, "\/tmp\/out\.txt", 12, &inox_promise_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_async_value_\d+ = loadText\(\);/)
  assert.match(
    result.code,
    /if \(inox_promise_resolved\(&inox_loop, inox_async_value_\d+, &loaded\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_retain\(inox_await_value_\d+\);\n {2}text_value_\d+ = inox_await_value_\d+;/)
  assert.match(result.code, /const inox_string \*text = \(inox_string \*\)text_value_\d+\.as\.ref;/)
})


test('lowers awaited rejected promises into C try catch', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const promise = Promise.reject('fail')

  try {
    await promise
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /if \(inox_promise_rejected\(&inox_loop, inox_value_\d+, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /if \(inox_promise_get_state\(promise\) == INOX_PROMISE_REJECTED\) \{/)
  assert.match(result.code, /if \(inox_promise_get_result\(promise, &inox_error\) != INOX_OK\)\s+goto inox_cleanup;/)
  assert.match(result.code, /inox_error_active = 1;/)
  assert.match(result.code, /goto inox_try_\d+_catch;/)
})


test('lowers awaited Error rejected promises into C try catch', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const promise = Promise.reject(new Error('stored error'))

  try {
    await promise
  } catch (error) {
    console.log(error.name, error.message)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /if \(inox_promise_rejected\(&inox_loop, inox_error_object_\d+, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_error\.tag != INOX_TAG_OBJECT \|\| inox_error\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /inox_try_\d+_catch:\n {4}if \(inox_error\.tag != INOX_TAG_OBJECT \|\| inox_error\.as\.ref == 0\)\s+goto inox_cleanup;/
  )
  assert.match(result.code, /inox_value error = inox_error;/)
  assert.match(result.code, /inox_object_get_known\(error, 0, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(error, 1, &inox_log_value_\d+\)/)
})


test('lowers awaited throwing async helpers through the C error channel', () => {
  const result = compileSource(
    `async function failText(): Promise<string> {
  throw 'async fail'
}

export async function main(): Promise<void> {
  try {
    const value = await failText()
    console.log(value)
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_status failText\(inox_value \*inox_out, inox_value \*inox_error_out\);/)
  assert.match(result.code, /inox_value inox_call_result_\d+ = inox_undefined_value\(\);/)
  assert.match(result.code, /inox_status inox_call_status_\d+ = failText\(&inox_call_result_\d+, &inox_error\);/)
  assert.doesNotMatch(result.code, /double inox_call_result_\d+ = 0;\n\s+inox_status inox_call_status_\d+ = failText/)
  assert.match(result.code, /if \(inox_call_status_\d+ == INOX_ERR_THROW\) \{/)
  assert.match(result.code, /goto inox_try_\d+_catch;/)
})


test('lowers async throws after awaits to rejected local promises', () => {
  const stringResult = compileSource(
    `async function failString(): Promise<string> {
  const seed: number = await Promise.resolve(1)
  throw 'bad'
}

export async function main(): Promise<void> {
  const promise = failString()

  try {
    const value = await promise
    console.log(value)
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    stringResult.code,
    /inox_status inox_async_status_\d+ = failString\(&inox_async_result_\d+, &inox_error\);/
  )
  assert.match(
    stringResult.code,
    /if \(inox_async_status_\d+ == INOX_ERR_THROW\) \{\n {4}if \(inox_promise_rejected\(&inox_loop, inox_error, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    stringResult.code,
    /if \(inox_promise_get_result\(promise, &inox_error\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(stringResult.code, /goto inox_try_\d+_catch;/)

  const errorResult = compileSource(
    `async function failError(): Promise<string> {
  const seed: number = await Promise.resolve(2)
  throw new Error('boom')
}

export async function main(): Promise<void> {
  const promise = failError()

  try {
    const value = await promise
    console.log(value)
  } catch (error) {
    console.log(error.message)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(errorResult.code, /inox_value inox_error_object_\d+ = inox_undefined_value\(\);/)
  assert.match(
    errorResult.code,
    /inox_status inox_async_status_\d+ = failError\(&inox_async_result_\d+, &inox_error\);/
  )
  assert.match(
    errorResult.code,
    /if \(inox_promise_rejected\(&inox_loop, inox_error, &promise\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    errorResult.code,
    /if \(inox_object_get_known\(error, 1, &inox_log_value_\d+\) != INOX_OK\)\s+goto inox_cleanup;/
  )
})


test('lowers nested async task frame try catch with outer finally', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return 7
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
})


test('lowers nested async task frame inner finally before outer catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } finally {
      console.log('inner finally')
    }
  } catch (error) {
    console.log(error)
    return 7
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
})


test('lowers nested async task frame inner catch under outer catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return 7
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
  assert.doesNotMatch(result.code, /inox_number_value\(9\)/)
})


test('lowers deeper nested async task frame try metadata', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      try {
        const value: number = await Promise.reject('inner')
        return value
      } finally {
        console.log('inner finally')
      }
    } catch (error) {
      console.log(error)
      return 7
    } finally {
      console.log('middle finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "middle finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "middle finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
})


test('lowers nested async task frame try prefixes before first await', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    console.log('outer prefix')
    try {
      console.log('middle prefix')
      try {
        const value: number = await Promise.resolve(3)
        return value
      } finally {
        console.log('inner finally')
      }
    } finally {
      console.log('middle finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*printf\("%s\\n", "outer prefix"\);[\s\S]*printf\("%s\\n", "middle prefix"\);[\s\S]*status = inox_promise_resolve\(frame->awaited, inox_number_value\(3\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "middle finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(value\)\);/
  )
})


test('lowers nested async task frame try prefix declarations into awaited expressions', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    const seed: number = 3
    try {
      const value: number = await Promise.resolve(seed)
      return value
    } finally {
      console.log('outer finally')
    }
  } finally {
    console.log('done')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*double seed = 3;[\s\S]*status = inox_promise_resolve\(frame->awaited, inox_number_value\(seed\)\);/
  )
  assert.doesNotMatch(result.code, /prefix_seed/)
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*printf\("%s\\n", "done"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(value\)\);/
  )
})


test('lowers nested async task frame inner body prefix locals into awaited expressions', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const prefix: Buffer = Buffer.from('ok', 'utf8')
      const pending: Promise<number> = Promise.resolve(prefix.length)
      const value: number = await pending
      return prefix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.length, result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*double local_value;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value prefix = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*inox_retain\(frame->prefix_prefix\);[\s\S]*inox_bytes_len\(prefix, &inox_bytes_len_\d+\)[\s\S]*status = inox_promise_resolved\(inox_loop, inox_number_value\(\(\(double\)inox_bytes_len_\d+\)\), &frame->awaited\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value prefix = frame->prefix_prefix;[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return inox_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame post await managed locals into inner try returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(value)
      return suffix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*double local_value;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*inox_value suffix = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*printf\("%g\\n", \(\(double\)value\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = inox_promise_resolve\(frame->promise, suffix\);[\s\S]*inox_release\(suffix\);[\s\S]*return status;/
  )
})


test('lowers nested async task frame post await scalar locals into inner try returns', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
      return total
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*double local_value;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*const double total = \(value \+ 4\);[\s\S]*printf\("%g\\n", \(\(double\)total\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(total\)\);/
  )
})


test('lowers nested async task frame post await locals before post-nested returns', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*const double total = \(value \+ 4\);[\s\S]*printf\("%g\\n", \(\(double\)total\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "after"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(9\)\);/
  )
})


test('lowers nested async task frame post await managed locals before post-nested returns', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const scratch: Buffer = Buffer.from('ok', 'utf8')
      console.log(value, scratch.length)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*inox_value scratch = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*inox_bytes_len\(scratch, &inox_bytes_len_\d+\)[\s\S]*printf\("%g %g\\n", \(\(double\)value\), \(\(double\)\(\(double\)inox_bytes_len_\d+\)\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "after"\);[\s\S]*inox_release\(scratch\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(9\)\);/
  )
})


test('lowers nested async task frame post try statements through finalizers', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "after inner"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = inox_promise_reject\(frame->promise, inox_error\);/
  )
})


test('lowers nested async task frame post try statements with outer catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } catch (error) {
    console.log(error)
    return 9
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal((result.code.match(/printf\("%s\\n", "inner finally"\);/g) ?? []).length, 2)
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "after inner"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_number_value\(9\)\);/
  )
})


test('lowers nested async task frame post try statements with inner catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
    } catch (error) {
      console.log(error)
      return 9
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal((result.code.match(/printf\("%s\\n", "inner finally"\);/g) ?? []).length, 2)
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "after inner"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(7\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_number_value\(9\)\);/
  )
})


test('lowers nested async task frame prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    const seed: number = 4
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner finally')
    }
    const total: number = seed + 5
    console.log(total)
    return seed
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*double prefix_seed;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*const double seed = 4;[\s\S]*frame->prefix_seed = seed;[\s\S]*status = inox_promise_resolve\(frame->awaited, inox_number_value\(3\)\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*double seed = frame->prefix_seed;[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*const double total = \(seed \+ 5\);[\s\S]*printf\("%g\\n", \(\(double\)total\)\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_number_value\(seed\)\);/
  )
})


test('lowers nested async task frame string prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(label: string): Promise<string> {
  try {
    const prefix: string = label
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(label)
  }
}

export async function main(): Promise<void> {
  const promise = work('Ada')
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value param_label;[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_value inox_arg_label, inox_promise \*\* out\) \{[\s\S]*const inox_string \*prefix = label;[\s\S]*frame->prefix_prefix\.tag = INOX_TAG_STRING;[\s\S]*frame->prefix_prefix\.as\.ref = \(inox_ref \*\)&prefix->header;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_string \*prefix = \(inox_string \*\)frame->prefix_prefix\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_value_\d+\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->param_label\);[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame produced string prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(count: number): Promise<string> {
  try {
    const prefix: string = String(count)
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(count)
  }
}

export async function main(): Promise<void> {
  const promise = work(4)
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*double param_count;[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, double inox_arg_count, inox_promise \*\* out\) \{[\s\S]*inox_retain\(inox_value_\d+\);[\s\S]*prefix_value_\d+ = inox_value_\d+;[\s\S]*const inox_string \*prefix = \(inox_string \*\)prefix_value_\d+\.as\.ref;[\s\S]*frame->prefix_prefix\.tag = INOX_TAG_STRING;[\s\S]*frame->prefix_prefix\.as\.ref = \(inox_ref \*\)&prefix->header;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_string \*prefix = \(inox_string \*\)frame->prefix_prefix\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_value_\d+\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame raw string prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<string> {
  try {
    const prefix: string = 'Ada'
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value inox_value_\d+ = inox_undefined_value\(\);[\s\S]*inox_string_from_literal\(&inox_default_allocator, "Ada", 3, &inox_value_\d+\)[\s\S]*inox_retain\(inox_value_\d+\);[\s\S]*prefix_value_\d+ = inox_value_\d+;[\s\S]*const inox_string \*prefix = \(inox_string \*\)prefix_value_\d+\.as\.ref;[\s\S]*frame->prefix_prefix\.tag = INOX_TAG_STRING;[\s\S]*frame->prefix_prefix\.as\.ref = \(inox_ref \*\)&prefix->header;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_string \*prefix = \(inox_string \*\)frame->prefix_prefix\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*return inox_promise_resolve\(frame->promise, inox_value_\d+\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame array prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Array<number>> {
  try {
    const prefix: number[] = [2, 4]
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  const result: number[] = await promise
  console.log(result[0], result[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value prefix = inox_undefined_value\(\);[\s\S]*inox_array_new\(&inox_default_allocator, 2, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value prefix = frame->prefix_prefix;[\s\S]*inox_array_len\(prefix, &inox_array_len_\d+\)[\s\S]*inox_array_get\(prefix, 1, &inox_log_value_\d+\)[\s\S]*return inox_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame bytes prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    const prefix: Buffer = Buffer.from('abc', 'utf8')
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  const text = result.toString()
  console.log(result[0], result[1], text)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value prefix = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"abc", 3, &inox_bytes_\d+\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value prefix = frame->prefix_prefix;[\s\S]*inox_bytes_len\(prefix, &inox_bytes_len_\d+\)[\s\S]*inox_bytes_get\(prefix, \(size_t\)\(1\), &inox_byte_\d+\)[\s\S]*return inox_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame object prefix locals into post try statements', () => {
  const result = compileSource(
    `type User = {
  name: string,
  score: number
}

async function work(): Promise<User> {
  try {
    const prefix: User = { name: 'Ada', score: 7 }
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.name)
    }
    console.log(prefix.score)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: User = await work()
  console.log(result.name, result.score)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value prefix = inox_undefined_value\(\);[\s\S]*inox_object_new\(&inox_default_allocator, &inox_shape_prefix_\d+, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value prefix = frame->prefix_prefix;[\s\S]*inox_object_get_known\(prefix, 0, &inox_log_value_\d+\)[\s\S]*inox_object_get_known\(prefix, 1, &inox_log_value_\d+\)[\s\S]*return inox_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame Map prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Map<string, number>> {
  try {
    const prefix: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.get('Ada') ?? 0)
    }
    console.log(prefix.get('Grace') ?? 0, prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Map<string, number> = await work()
  console.log(result.get('Grace') ?? 0, result.size)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value prefix = inox_undefined_value\(\);[\s\S]*inox_map_new\(&inox_default_allocator, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value prefix = frame->prefix_prefix;[\s\S]*inox_map_get\(prefix, inox_value_\d+, &inox_map_value_\d+\)[\s\S]*inox_map_get\(prefix, inox_value_\d+, &inox_map_value_\d+\)[\s\S]*inox_map_size\(prefix, &inox_map_size_\d+\)[\s\S]*return inox_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame Set prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Set<string>> {
  try {
    const prefix: Set<string> = new Set(['Ada', 'Grace'])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.has('Ada'))
    }
    console.log(prefix.has('Grace'), prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Set<string> = await work()
  console.log(result.has('Grace'), result.size)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_async_task_work_frame \{[\s\S]*inox_value prefix_prefix;[\s\S]*\} inox_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_start\(inox_loop \*inox_loop, inox_promise \*\* out\) \{[\s\S]*inox_value prefix = inox_undefined_value\(\);[\s\S]*inox_set_new\(&inox_default_allocator, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*inox_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value prefix = frame->prefix_prefix;[\s\S]*inox_set_has\(prefix, inox_value_\d+, &inox_set_has_\d+\)[\s\S]*inox_set_has\(prefix, inox_value_\d+, &inox_set_has_\d+\)[\s\S]*inox_set_size\(prefix, &inox_set_size_\d+\)[\s\S]*return inox_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void inox_async_task_work_finalize\(void \*context\) \{[\s\S]*inox_release\(frame->prefix_prefix\);/
  )
})


test('lowers nested async task frame post try managed locals into returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner')
    }
    const suffix: Buffer = Buffer.from('ok', 'utf8')
    console.log(suffix.length)
    return suffix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_resume\(void \*context, inox_value inox_value_input\) \{[\s\S]*inox_value suffix = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*inox_bytes_len\(suffix, &inox_bytes_len_\d+\)[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = inox_promise_resolve\(frame->promise, suffix\);[\s\S]*inox_release\(suffix\);[\s\S]*return status;/
  )
})


test('lowers nested async task frame catch managed locals into returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(error)
      console.log(suffix.length)
      return suffix
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*inox_value suffix = inox_undefined_value\(\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*inox_bytes_len\(suffix, &inox_bytes_len_\d+\)[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = inox_promise_resolve\(frame->promise, suffix\);[\s\S]*inox_release\(suffix\);[\s\S]*return status;/
  )
})


test('lowers nested async task frame catch direct managed returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_async_task_work_reject\(void \*context, inox_value inox_error\) \{[\s\S]*inox_string \*error = \(inox_string \*\)inox_error\.as\.ref;[\s\S]*inox_value inox_bytes_\d+ = inox_undefined_value\(\);[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*inox_bytes_from_data\(&inox_default_allocator, \(const uint8_t \*\)"ok", 2, &inox_bytes_\d+\)[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = inox_promise_resolve\(frame->promise, inox_bytes_\d+\);[\s\S]*inox_release\(inox_bytes_\d+\);[\s\S]*return status;/
  )
})


test('reports nested async task frame catch throw paths as unsupported', () => {
  assertDiagnostic(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      throw 'catch fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    'INOX_C_ASYNC',
    {
      target: 'c'
    }
  )
})


test('keeps nested async finalizer throw paths on the non-task-frame fallback', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(1)
      return value
    } finally {
      throw 'finally fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.doesNotMatch(result.code, /inox_async_task_work/)
  assert.match(result.code, /inox_try_\d+_finally:/)
  assert.match(result.code, /goto inox_try_\d+_catch;/)
})


test('tracks Promise generic metadata through checker and IR', () => {
  const result = compileSource(
    `function makeValue(): Promise<number> {
  return Promise.resolve(7)
}

export function main(): void {
  const value: Promise<number> = Promise.resolve(1)
  const inferred = Promise.resolve('ok')
}
`,
    {
      target: 'c'
    }
  )
  const makeValue = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'makeValue')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const value = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'value')
  const inferred = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'inferred')
  const makeValueDeclaration = result.ir.functionDeclarations.find((item) => item.name === 'makeValue')

  assert.ok(makeValue)
  assert.ok(value)
  assert.ok(inferred)
  assert.equal(makeValue.returnType, 'promise')
  assert.equal(makeValue.returnPromiseValueType, 'number')
  assert.equal(makeValueDeclaration?.returnPromiseValueType, 'number')
  assert.equal(value.valueType, 'promise')
  assert.equal(value.promiseValueType, 'number')
  assert.equal(inferred.valueType, 'promise')
  assert.equal(inferred.promiseValueType, 'string')
  assert.deepEqual(result.ir.features, ['async-runtime'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime'])

  assertDiagnostic(
    `export function main(): void {
  const value: Promise<number> = Promise.resolve('nope')
  console.log(value)
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('tracks Promise constructor generic metadata through checker and IR', () => {
  const result = compileSource(
    `function makeText(): Promise<string> {
  return new Promise((resolve) => {
    const prefix = 'ok'
    resolve(\`\${prefix} \${String(7)}\`)
  })
}

export async function main(): Promise<void> {
  const value = await makeText()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )
  const makeText = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'makeText')
  const returnStatement = makeText?.body.find((item) => item.type === 'ReturnStatement')
  const makeTextDeclaration = result.ir.functionDeclarations.find((item) => item.name === 'makeText')

  assert.ok(returnStatement)
  assert.equal(returnStatement.argument.valueType, 'promise')
  assert.equal(returnStatement.argument.promiseValueType, 'string')
  assert.equal(makeTextDeclaration?.returnType, 'promise')
  assert.equal(makeTextDeclaration?.returnPromiseValueType, 'string')
  assert.match(result.code, /inox_promise_new\(inox_loop, &inox_return\)/)

  assertDiagnostic(
    `export function main(): void {
  const value: Promise<number> = new Promise((resolve) => {
    resolve('nope')
  })
  console.log(value)
}
`,
    'INOX_TYPE_MISMATCH'
  )
})


test('lowers Promise constructor timer resolves and template update placeholders to C', () => {
  const result = compileSource(
    `function makeText(): Promise<string> {
  return new Promise((resolve) => {
    const prefix = 'ready'
    const count = 7

    setTimeout(() => {
      resolve(\`\${prefix} \${String(count)}\`)
    }, 1)
  })
}

const text = await makeText()
let i = 0
console.log(text, \`interval \${++i}\`)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /inox_promise \*resolve;/)
  assert.match(result.code, /inox_promise_retain\(inox_callback_ctx_\d+->resolve\);/)
  assert.match(result.code, /inox_promise_resolve\(resolve, inox_value_\d+\)/)
  assert.match(result.code, /inox_loop_poll\(&inox_loop, inox_performance_now\(\)\)/)
  assert.match(result.code, /inox_string_from_number\(&inox_default_allocator, \(\+\+i\), &inox_value_\d+\)/)
})


test('checks Promise then catch as typed chain calls', () => {
  const result = compileSource(
    `export function main(): void {
  const source: Promise<number> = Promise.resolve(2)
  const doubled = source.then(value => value * 2)
  const failed: Promise<string> = Promise.reject(new Error('bad'))
  const recovered = failed.catch(error => 'ok')
  const chained = source
    .then(value => value + 1)
    .catch(error => 0)
    .then(value => String(value))

}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const doubled = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'doubled')
  const recovered = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'recovered')
  const chained = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'chained')
  const thenCallback = doubled?.init.args[0]
  const catchCallback = recovered?.init.args[0]

  assert.equal(doubled?.valueType, 'promise')
  assert.equal(doubled?.promiseValueType, 'number')
  assert.equal(thenCallback?.params[0].valueType, 'number')
  assert.equal(thenCallback?.returnType, 'number')
  assert.equal(recovered?.valueType, 'promise')
  assert.equal(recovered?.promiseValueType, 'string')
  assert.equal(catchCallback?.params[0].valueType, 'unknown')
  assert.equal(catchCallback?.returnType, 'string')
  assert.equal(chained?.valueType, 'promise')
  assert.equal(chained?.promiseValueType, 'string')
  assert.equal(result.ir.features.includes('async-runtime'), true)

  const multiStatement = compileSource(
    `export function main(): void {
  const promise = Promise.resolve(1).then(value => {
    const doubled = value * 2

    return doubled
  })
}
`,
    {
      target: 'c'
    }
  )
  const multiMain = multiStatement.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const multiPromise = multiMain?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'promise')

  assert.equal(multiPromise?.promiseValueType, 'number')

  const branchStatement = compileSource(
    `export function main(): void {
  const promise = Promise.resolve(1).then(value => {
    if (value > 0) {
      return value
    }

    return 0
  })
}
`,
    {
      target: 'c'
    }
  )
  const branchMain = branchStatement.hir.body.find(
    (item) => item.type === 'FunctionDeclaration' && item.name === 'main'
  )
  const branchPromise = branchMain?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'promise')

  assert.equal(branchPromise?.promiseValueType, 'number')

  const switchStatement = compileSource(
    `export function main(): void {
  const promise = Promise.resolve(2).then(value => {
    switch (value) {
      case 2:
        return value
      default:
        return 0
    }

    return 1
  })
}
`,
    {
      target: 'c'
    }
  )
  const switchMain = switchStatement.hir.body.find(
    (item) => item.type === 'FunctionDeclaration' && item.name === 'main'
  )
  const switchPromise = switchMain?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'promise')

  assert.equal(switchPromise?.promiseValueType, 'number')

  assertDiagnostic(
    `export function main(): void {
  const source: Promise<number> = Promise.resolve(2)
  source.then((value: string) => value)
}
`,
    'INOX_TYPE_MISMATCH'
  )
  assertDiagnostic(
    `export function main(): void {
  const failed: Promise<string> = Promise.reject(new Error('bad'))
  failed.catch(error => 1)
}
`,
    'INOX_TYPE_MISMATCH'
  )
  assertDiagnostic(
    `export function main(): void {
  const promise = Promise.resolve(1).then(value => {
    while (value > 0) {
      return value
    }

    return 0
  })
  console.log(promise)
}
`,
    'INOX_C_ASYNC',
    {
      target: 'c'
    }
  )
})


test('lowers Promise then catch chains to C runtime promises', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const doubled = Promise.resolve(4).then(value => value * 2)
  const blockDoubled = Promise.resolve(5).then(value => {
    return value * 3
  })
  const multiDoubled = Promise.resolve(6).then(value => {
    const doubled = value * 2

    return doubled
  })
  const branchDoubled = Promise.resolve(7).then(value => {
    if (value > 5) {
      return value * 2
    }

    return value
  })
  const switchDoubled = Promise.resolve(2).then(value => {
    switch (value) {
      case 2:
        return value * 10
      default:
        return 0
    }

    return value
  })
  const failed: Promise<number> = Promise.reject('fail')
  const recovered = failed.catch(error => 95)
  const blockRecovered = failed.catch(error => {
    return 96
  })
  const multiRecovered = failed.catch(error => {
    const recovered = 97

    return recovered
  })
  const branchRecovered = failed.catch(error => {
    if (1 === 1) {
      return 98
    }

    return 0
  })

  console.log(await doubled, await blockDoubled, await multiDoubled, await branchDoubled, await switchDoubled, await recovered, await blockRecovered, await multiRecovered, await branchRecovered)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_promise_chain_arrow_\d+\(void \*context, inox_value inox_value_input, inox_value \*out\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_promise_chain_arrow_\d+\(void \*context, inox_value inox_value_input, inox_value \*out\) \{\n {2}\(void\)context;\n {2}if \(out == 0\) return INOX_ERR_TYPE;\n {2}\*out = inox_undefined_value\(\);\n {2}if \(inox_value_input\.tag != INOX_TAG_NUMBER\) return INOX_ERR_TYPE;\n {2}double value = inox_value_input\.as\.number;/
  )
  assert.match(result.code, /\*out = inox_number_value\(\(value \* 2\)\);/)
  assert.match(result.code, /\*out = inox_number_value\(\(value \* 3\)\);/)
  assert.match(result.code, /const double doubled = \(value \* 2\);/)
  assert.match(result.code, /\*out = inox_number_value\(doubled\);/)
  assert.match(
    result.code,
    /if \(value > 5\) \{\n {4}\(\*out\) = inox_number_value\(\(value \* 2\)\);\n {4}goto inox_promise_callback_cleanup;\n {2}\}/
  )
  assert.match(
    result.code,
    /\(\*out\) = inox_number_value\(value\);\n {2}goto inox_promise_callback_cleanup;\ninox_promise_callback_cleanup:/
  )
  assert.match(
    result.code,
    /switch \(\(int\)value\) \{\n {4}case \(int\)2: \{\n {6}\(\*out\) = inox_number_value\(\(value \* 10\)\);\n {6}goto inox_promise_callback_cleanup;/
  )
  assert.match(result.code, /\*out = inox_number_value\(96\);/)
  assert.match(result.code, /const double recovered = 97;/)
  assert.match(result.code, /\*out = inox_number_value\(recovered\);/)
  assert.match(
    result.code,
    /if \(1 == 1\) \{\n {4}\(\*out\) = inox_number_value\(98\);\n {4}goto inox_promise_callback_cleanup;\n {2}\}/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &doubled\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &blockDoubled\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &multiDoubled\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &branchDoubled\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &switchDoubled\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_catch\(failed, inox_promise_chain_arrow_\d+, 0, 0, &recovered\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_catch\(failed, inox_promise_chain_arrow_\d+, 0, 0, &blockRecovered\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_catch\(failed, inox_promise_chain_arrow_\d+, 0, 0, &multiRecovered\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_catch\(failed, inox_promise_chain_arrow_\d+, 0, 0, &branchRecovered\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /while \(inox_promise_get_state\(doubled\) == INOX_PROMISE_PENDING && inox_loop_has_work\(&inox_loop\)\) \{/
  )
  assert.match(
    result.code,
    /while \(inox_promise_get_state\(blockDoubled\) == INOX_PROMISE_PENDING && inox_loop_has_work\(&inox_loop\)\) \{/
  )
  assert.match(
    result.code,
    /while \(inox_promise_get_state\(recovered\) == INOX_PROMISE_PENDING && inox_loop_has_work\(&inox_loop\)\) \{/
  )
})


test('lowers Promise callback loop bodies to C runtime promises', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const whileTotal = Promise.resolve(3).then(value => {
    let total = 0

    while (value > 0) {
      total = total + value
      value = value - 1
    }

    return total
  })
  const forTotal = Promise.resolve(4).then(value => {
    let total = 0

    for (let index = 0; index < value; index = index + 1) {
      if (index === 2) {
        continue
      }

      total = total + index
    }

    return total
  })

  console.log(await whileTotal, await forTotal)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /while \(value > 0\) \{/)
  assert.match(result.code, /for \(double index = 0; \(index < value\); \(index = \(index \+ 1\)\)\) \{/)
  assert.match(result.code, /goto inox_continue_\d+;/)
  assert.match(result.code, /\(\*out\) = inox_number_value\(total\);\n {2}goto inox_promise_callback_cleanup;/)
})


test('lowers captured Promise callbacks to C runtime promises', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export async function main(): Promise<void> {
  const extra = 3
  const ok = true
  const literal = 'literal'
  const user: User = { name: 'captured' }
  const label = user.name
  const raw = Promise.resolve(1).then(value => {
    console.log(literal)

    return value + extra
  })
  const added = Promise.resolve(4).then(value => value + extra)
  const logged = Promise.resolve(5).then(value => {
    console.log(label)

    return value + extra
  })
  const objectLogged = Promise.resolve(6).then(value => {
    if (ok) {
      console.log(user.name)

      return value + extra
    }

    return value
  })

  console.log(await raw, await added, await logged, await objectLogged)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_promise_chain_context_\d+ \{\n {2}double extra;\n\} inox_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /typedef struct inox_promise_chain_context_\d+ \{\n {2}const char \*literal;\n {2}double extra;\n\} inox_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /typedef struct inox_promise_chain_context_\d+ \{\n {2}inox_value label;\n {2}double extra;\n\} inox_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /typedef struct inox_promise_chain_context_\d+ \{\n {2}double ok;\n {2}inox_value user;\n {2}double extra;\n\} inox_promise_chain_context_\d+;/
  )
  assert.match(result.code, /static void inox_promise_chain_context_\d+_finalize\(void \*context\);/)
  assert.match(
    result.code,
    /inox_promise_chain_context_\d+\* captured = \(inox_promise_chain_context_\d+\*\)context;\n {2}inox_release\(captured->label\);/
  )
  assert.match(
    result.code,
    /inox_promise_chain_context_\d+\* captured = \(inox_promise_chain_context_\d+\*\)context;\n {2}inox_release\(captured->user\);/
  )
  assert.match(
    result.code,
    /inox_promise_chain_context_\d+\* captured = \(inox_promise_chain_context_\d+\*\)context;\n {2}double extra = captured->extra;/
  )
  assert.match(result.code, /double ok = captured->ok;/)
  assert.match(result.code, /const char \*literal = captured->literal;/)
  assert.match(result.code, /inox_string \*label = \(inox_string \*\)captured->label\.as\.ref;/)
  assert.match(result.code, /inox_value user = captured->user;/)
  assert.match(result.code, /inox_promise_callback_ctx_\d+->literal = literal;/)
  assert.match(
    result.code,
    /inox_promise_callback_ctx_\d+->label\.tag = INOX_TAG_STRING;\n {2}inox_promise_callback_ctx_\d+->label\.as\.ref = \(inox_ref \*\)&label->header;\n {2}inox_retain\(inox_promise_callback_ctx_\d+->label\);/
  )
  assert.match(result.code, /inox_promise_callback_ctx_\d+->ok = ok;/)
  assert.match(
    result.code,
    /inox_promise_callback_ctx_\d+->user = user;\n {2}inox_retain\(inox_promise_callback_ctx_\d+->user\);/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, inox_promise_callback_ctx_\d+, inox_promise_chain_context_\d+_finalize, &raw\) != INOX_OK\) \{/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, inox_promise_callback_ctx_\d+, inox_promise_chain_context_\d+_finalize, &added\) != INOX_OK\) \{/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, inox_promise_callback_ctx_\d+, inox_promise_chain_context_\d+_finalize, &logged\) != INOX_OK\) \{/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, inox_promise_callback_ctx_\d+, inox_promise_chain_context_\d+_finalize, &objectLogged\) != INOX_OK\) \{/
  )
})


test('rejects mutable Promise callback captures in C with stable diagnostics', () => {
  assertDiagnostic(
    `export function main(): void {
  let total = 0
  const promise = Promise.resolve(1).then(value => {
    total = total + value

    return total
  })
}
`,
    'INOX_C_ASYNC',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  let handled = 0
  const promise = Promise.reject('bad').catch(error => {
    handled = handled + 1

    return handled
  })
}
`,
    'INOX_C_ASYNC',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `function make(): Promise<number> {
  let total = 0

  return Promise.resolve(1).then(value => {
    total = total + value

    return total
  })
}

export async function main(): Promise<void> {
  console.log(await make())
}
`,
    'INOX_C_ASYNC',
    {
      target: 'c'
    }
  )
})


test('lowers Promise callbacks with try catch finally to C runtime promises', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const handled = Promise.resolve(3).then(value => {
    try {
      if (value > 2) {
        throw 'large'
      }

      return value
    } catch (error) {
      console.log(error)

      return 7
    } finally {
      console.log('chain finally')
    }

    return 0
  })
  const finalized = Promise.resolve(2).then(value => {
    try {
      return value * 2
    } finally {
      console.log('return finally')
    }

    return 0
  })

  console.log(await handled, await finalized)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static inox_status inox_promise_chain_arrow_\d+\(void \*context, inox_value inox_value_input, inox_value \*out\) \{[\s\S]*inox_try_\d+_catch:/
  )
  assert.match(result.code, /inox_error_active = 1;\n\s+goto inox_try_\d+_catch;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);/)
  assert.match(
    result.code,
    /\(\*out\) = inox_number_value\(7\);\n\s+inox_return_active = 1;\n\s+goto inox_try_\d+_finally;/
  )
  assert.match(result.code, /printf\("%s\\n", "chain finally"\);/)
  assert.match(
    result.code,
    /\(\*out\) = inox_number_value\(\(value \* 2\)\);\n\s+inox_return_active = 1;\n\s+goto inox_try_\d+_finally;/
  )
  assert.match(result.code, /printf\("%s\\n", "return finally"\);/)
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &handled\) != INOX_OK\)\s+goto inox_cleanup;/
  )
  assert.match(
    result.code,
    /if \(inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, 0, 0, &finalized\) != INOX_OK\)\s+goto inox_cleanup;/
  )
})


test('passes loop context to C Promise callbacks that schedule timers', () => {
  const result = compileSource(
    `export function main(): void {
  const pending = Promise.resolve(1).then(value => {
    setTimeout(() => {
      console.log(value)
    }, 1)

    return value
  })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct inox_promise_chain_context_\d+ \{\n {2}inox_loop \*inox_loop;\n\} inox_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /inox_promise_chain_context_\d+\* captured = \(inox_promise_chain_context_\d+\*\)context;\n {2}if \(captured->inox_loop == 0\) return INOX_ERR_TYPE;\n {2}inox_loop \*inox_loop = captured->inox_loop;/
  )
  assert.match(
    result.code,
    /typedef struct inox_callback_context_\d+ \{\n {2}double value;\n\} inox_callback_context_\d+;/
  )
  assert.match(result.code, /inox_promise_callback_ctx_\d+->inox_loop = inox_loop;/)
  assert.match(result.code, /inox_callback_ctx_\d+->value = value;/)
  assert.match(
    result.code,
    /inox_loop_set_timeout\(inox_loop, 1, inox_timer_callback_run, inox_timer_ctx_\d+, inox_timer_callback_finalize, 0\)/
  )
  assert.match(
    result.code,
    /inox_promise_chain\(inox_promise_\d+, inox_promise_chain_arrow_\d+, 0, inox_promise_callback_ctx_\d+, inox_promise_chain_context_\d+_finalize, &pending\)/
  )
})


test('rejects await outside async functions', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = await Promise.resolve(1)
  console.log(value)
}
`,
    'INOX_AWAIT_OUTSIDE_ASYNC'
  )
})


test('accepts await in top-level C entry statements', () => {
  const result = compileSource(
    `const value = await Promise.resolve(1)
console.log(value)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int main\(void\) \{/)
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime'])
})
