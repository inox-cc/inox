export type ParitySnapshotValue =
  | boolean
  | number
  | string
  | null
  | ParitySnapshotValue[]
  | { [key: string]: ParitySnapshotValue }

/** Normalizes compiler parity data without depending on target-library semantics. */
export function normalizeParitySnapshot(value: unknown, propertyName: string | null = null): ParitySnapshotValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const items = value.map((item) =>
      typeof item === 'undefined' ? null : normalizeParitySnapshot(item)
    )

    if (propertyName === 'features' || propertyName === 'runtimeRequirements') {
      items.sort(compareParitySnapshotValues)
    }

    return items
  }

  if (typeof value === 'object') {
    const result: { [key: string]: ParitySnapshotValue } = {}
    const source = value as { [key: string]: unknown }
    const keys = Object.keys(source).sort()

    for (const key of keys) {
      const item = source[key]

      if (key === 'loc' || typeof item === 'undefined') {
        continue
      }

      result[key] = normalizeParitySnapshot(item, key)
    }

    return result
  }

  return String(value)
}

function compareParitySnapshotValues(left: ParitySnapshotValue, right: ParitySnapshotValue): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}
