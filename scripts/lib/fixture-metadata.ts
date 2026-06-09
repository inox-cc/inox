const knownKeys = new Set([
  'diagnostic',
  'exit',
  'expect',
  'features',
  'platforms',
  'stderr',
  'stdout',
  'targets'
])

const knownExpectations = new Set(['pass', 'diagnostic', 'runtime-error'])

export function parseFixtureMetadata(source: string): { metadata: Map<string, string>, bodyStartLine: number } {
  const metadata = new Map()
  const lines = source.split(/\r?\n/)
  let bodyStartLine = 1

  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      bodyStartLine = index + 2
      continue
    }

    const match = line.match(/^\/\/\s*@([a-zA-Z][\w-]*)\s*(.*)$/)

    if (!match) {
      bodyStartLine = index + 1
      break
    }

    metadata.set(match[1], match[2].trim())
    bodyStartLine = index + 2
  }

  return {
    metadata,
    bodyStartLine
  }
}

export function parseMetadataList(value: string): string[] {
  if (value.trim() === '') {
    return []
  }

  return value.split(',').map(item => item.trim()).filter(Boolean)
}

export function validateFixtureMetadata(source: string): { metadata: Map<string, string>, failures: string[] } {
  const { metadata } = parseFixtureMetadata(source)
  const failures: string[] = []

  for (const key of metadata.keys()) {
    if (!knownKeys.has(key)) {
      failures.push(`unknown metadata key @${key}`)
    }
  }

  const expectation = metadata.get('expect')

  if (expectation == null) {
    failures.push('missing @expect metadata')
  } else if (!knownExpectations.has(expectation)) {
    failures.push(`unknown @expect value ${JSON.stringify(expectation)}`)
  }

  if (expectation === 'diagnostic' && metadata.get('diagnostic') == null) {
    failures.push('diagnostic fixtures must include @diagnostic')
  }

  for (const key of ['targets', 'platforms', 'features']) {
    const value = metadata.get(key)

    if (value != null && parseMetadataList(value).length === 0) {
      failures.push(`@${key} must contain at least one value`)
    }
  }

  return {
    metadata,
    failures
  }
}
