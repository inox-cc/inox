import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

type SourceFile = {
  path: string
  text: string
  lines: number
}

type PatternInfo = {
  name: string
  decision:
    | 'supported now'
    | 'simplify/remove'
    | 'implement support'
    | 'host-adapter boundary'
    | 'required/core-simplify'
    | 'required/lower-core-simplify'
    | 'lower/core-simplify'
  pattern: RegExp
  note: string
  maxAllowedMatches?: number
}

type PatternSummary = {
  info: PatternInfo
  count: number
  files: Map<string, number>
}

type AuditReport = {
  files: SourceFile[]
  totalLines: number
  hostImports: Map<string, Set<string>>
  summaries: PatternSummary[]
  largest: SourceFile[]
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const compilerRoot = join(repoRoot, 'src/compiler')
const outputPath = join(repoRoot, 'docs/compiler-self-hosting-capability-matrix.md')

const patterns: PatternInfo[] = [
  {
    name: 'AnyNode / open AST shapes',
    decision: 'simplify/remove',
    pattern: /\bAnyNode\b/g,
    note: 'Replace hot paths with explicit AST/HIR/IR node shapes before self-hosting.',
    maxAllowedMatches: 1626
  },
  {
    name: 'object/array spread',
    decision: 'simplify/remove',
    pattern: /\.\.\./g,
    note: 'Current C subset does not lower broad spread-heavy object copying.',
    maxAllowedMatches: 1078
  },
  {
    name: 'Object.entries / Object.keys / Object.values',
    decision: 'required/core-simplify',
    pattern: /\bObject\.(entries|keys|values)\s*\(/g,
    note: 'Required language features; compiler-core may rewrite them only when explicit loops or records stay compact.',
    maxAllowedMatches: 16
  },
  {
    name: 'Array.from',
    decision: 'required/core-simplify',
    pattern: /\bArray\.from\s*\(/g,
    note: 'Required language feature; compiler-core can use direct array accumulation when the replacement stays compact.',
    maxAllowedMatches: 0
  },
  {
    name: 'Array.reduce',
    decision: 'required/lower-core-simplify',
    pattern: /\.reduce\s*\(/g,
    note: 'Required language feature; lower supported reducer shapes to explicit loops while keeping compiler-core source reduce-free.',
    maxAllowedMatches: 0
  },
  {
    name: 'flatMap / map / filter / sort',
    decision: 'lower/core-simplify',
    pattern: /\.(flatMap|map|filter|sort)\s*\(/g,
    note: 'Compact Array.filter/find/map lowering is supported for known slices; broad callback-heavy chains in compiler-core should become explicit loops.',
    maxAllowedMatches: 444
  },
  {
    name: 'try / catch',
    decision: 'implement support',
    pattern: /\b(try|catch)\b/g,
    note: 'Use only at host adapter boundaries until C exception lowering is planned.',
    maxAllowedMatches: 62
  },
  {
    name: 'async / await',
    decision: 'supported now',
    pattern: /\b(async|await)\b/g,
    note: 'Compiler-core should start in-memory; module graph loading can stay behind host adapters.'
  },
  {
    name: 'RegExp usage',
    decision: 'simplify/remove',
    pattern: /\bRegExp\b|(^|[=(,:\s])\/(?:\\.|[^/\n])+\/[dgimsuvy]*/gm,
    note: 'Lexer, parser helpers and C formatting should avoid regex where a small scanner is clearer.',
    maxAllowedMatches: 22
  },
  {
    name: 'generic container types',
    decision: 'simplify/remove',
    pattern: /\b(Record|ReadonlyMap|Map|Set)<|ReadonlyArray</g,
    note: 'Self-hosted type surface should prefer explicit aliases and concrete record arrays.',
    maxAllowedMatches: 335
  }
]

const allowedHostImports = new Map<string, Set<string>>([
  ['node:crypto', new Set(['src/compiler/node-host.ts'])],
  ['node:fs/promises', new Set(['src/compiler/node-host.ts'])],
  ['node:path', new Set(['src/compiler/node-host.ts'])],
  ['node:url', new Set(['src/compiler/node-host.ts'])]
])

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'))
  const mode = args.has('--write') ? 'write' : args.has('--gate') ? 'gate' : args.has('--check') ? 'check' : 'print'
  const files = await readSourceFiles(compilerRoot)
  const report = analyzeFiles(files)
  const markdown = renderMatrix(report)

  if (mode === 'write') {
    await writeFile(outputPath, markdown)
    return
  }

  if (mode === 'check' || mode === 'gate') {
    const current = await readFile(outputPath, 'utf8').catch(() => '')

    if (current !== markdown) {
      console.error(`${relative(repoRoot, outputPath)} is stale. Run pnpm run audit:self-hosting -- --write.`)
      process.exitCode = 1
    }

    if (mode === 'gate') {
      const failures = collectGateFailures(report)

      for (const failure of failures) {
        console.error(failure)
      }

      if (failures.length > 0) {
        process.exitCode = 1
      }
    }

    return
  }

  process.stdout.write(markdown)
}

async function readSourceFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = []

  await walk(root)

  return files.sort((left, right) => left.path.localeCompare(right.path))

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, {
      withFileTypes: true
    })

    for (const entry of entries) {
      const path = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(path)
        continue
      }

      if (!entry.isFile() || !entry.name.endsWith('.ts')) {
        continue
      }

      const text = await readFile(path, 'utf8')

      files.push({
        path: relative(repoRoot, path),
        text,
        lines: text.split('\n').length
      })
    }
  }
}

function analyzeFiles(files: SourceFile[]): AuditReport {
  const totalLines = files.reduce((sum, file) => sum + file.lines, 0)
  const hostImports = collectHostImports(files)
  const summaries = patterns.map((info) => summarizePattern(info, files))
  const largest = [...files].sort((left, right) => right.lines - left.lines).slice(0, 10)

  return {
    files,
    totalLines,
    hostImports,
    summaries,
    largest
  }
}

function renderMatrix(report: AuditReport): string {
  const lines: string[] = [
    '# Compiler Self-Hosting Capability Matrix',
    '',
    '<!-- Generated by `node scripts/audit-self-hosting.ts --write`. Do not edit tables by hand. -->',
    '',
    'This matrix makes the self-hosting blockers in `src/compiler` measurable. It',
    'is intentionally an audit artifact, not a failing support matrix: unsupported',
    'features are expected while the compiler is still hosted by Node.',
    '',
    'The CI-friendly gate is `pnpm run audit:self-hosting -- --gate`. It fails if',
    'this generated file is stale, if host `node:*` imports move outside approved',
    'host adapter boundaries, or if unsupported blocker counts grow above the',
    'current baseline.',
    '',
    '## Snapshot',
    '',
    `- TypeScript files: ${report.files.length}`,
    `- TypeScript lines: ${report.totalLines}`,
    `- Largest file: ${report.largest[0]?.path ?? '-'} (${report.largest[0]?.lines ?? 0} lines)`,
    '- Source set: `src/compiler/**/*.ts`',
    '',
    '## Largest Files',
    '',
    '<!-- prettier-ignore-start -->',
    '| File | Lines |',
    '| --- | ---: |',
    ...report.largest.map((file) => `| \`${file.path}\` | ${file.lines} |`),
    '<!-- prettier-ignore-end -->',
    '',
    '## Host Node Imports',
    '',
    '<!-- prettier-ignore-start -->',
    '| Module | Decision | Files |',
    '| --- | --- | --- |',
    ...[...report.hostImports.entries()].map(([module, moduleFiles]) => {
      const fileList = [...moduleFiles]
        .sort()
        .map((file) => `\`${file}\``)
        .join('<br>')
      const decision = hostImportDecision(module, moduleFiles)

      return `| \`${module}\` | ${decision} | ${fileList} |`
    }),
    '<!-- prettier-ignore-end -->',
    '',
    '## Feature Heuristics',
    '',
    '<!-- prettier-ignore-start -->',
    '| Feature | Decision | Matches | Gate baseline | Hot Files | Note |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...report.summaries.map((summary) => {
      const hotFiles = [...summary.files.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([file, count]) => `\`${file}\` (${count})`)
        .join('<br>')
      const baseline = summary.info.maxAllowedMatches == null ? '-' : `<= ${summary.info.maxAllowedMatches}`

      return `| ${summary.info.name} | ${summary.info.decision} | ${summary.count} | ${baseline} | ${hotFiles || '-'} | ${summary.info.note} |`
    }),
    '<!-- prettier-ignore-end -->',
    '',
    '## Work Queue',
    '',
    '1. Keep the first self-hosted target in-memory and compiler-core only.',
    '2. Put `node:fs/promises`, `node:path`, `node:url` and `node:crypto` host dependencies behind adapters or ccjs stdlib slices.',
    '3. Extract the remaining large C emitter clusters before trying to compile `src/compiler/c/index.ts` with ccjs.',
    '4. Replace new `AnyNode` mutation surfaces with explicit node shapes as code is touched.',
    '5. Rewrite regex-heavy helpers only when a small scanner is simpler than broad RegExp runtime support.'
  ]

  return `${lines.join('\n')}\n`
}

function collectGateFailures(report: AuditReport): string[] {
  const failures: string[] = []

  for (const summary of report.summaries) {
    const max = summary.info.maxAllowedMatches

    if (max == null || summary.count <= max) {
      continue
    }

    failures.push(
      `${summary.info.name} increased to ${summary.count}; self-hosting gate baseline is ${max}. ` +
        `Reduce the new usage or update the baseline with a plan note.`
    )
  }

  for (const [module, files] of report.hostImports) {
    const allowedFiles = allowedHostImports.get(module)

    for (const file of files) {
      if (allowedFiles != null && allowedFiles.has(file)) {
        continue
      }

      failures.push(
        `${module} host import in ${file} is outside the approved compiler host adapter boundary.`
      )
    }
  }

  return failures
}

function hostImportDecision(module: string, files: Set<string>): string {
  const allowedFiles = allowedHostImports.get(module)

  if (allowedFiles == null) {
    return 'unapproved host dependency'
  }

  for (const file of files) {
    if (!allowedFiles.has(file)) {
      return 'outside host-adapter boundary'
    }
  }

  return 'host-adapter boundary'
}

function collectHostImports(files: SourceFile[]): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>()
  const importPattern = /\bfrom\s+['"](node:[^'"]+)['"]/g

  for (const file of files) {
    for (const match of file.text.matchAll(importPattern)) {
      const module = match[1]
      const moduleFiles = imports.get(module) ?? new Set<string>()

      moduleFiles.add(file.path)
      imports.set(module, moduleFiles)
    }
  }

  return new Map([...imports.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function summarizePattern(info: PatternInfo, files: SourceFile[]): PatternSummary {
  const summary: PatternSummary = {
    info,
    count: 0,
    files: new Map()
  }

  for (const file of files) {
    const matches = [...file.text.matchAll(info.pattern)].length

    if (matches === 0) {
      continue
    }

    summary.count += matches
    summary.files.set(file.path, matches)
  }

  return summary
}

await main()
