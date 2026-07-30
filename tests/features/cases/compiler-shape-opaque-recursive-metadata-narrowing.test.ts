// @targets cc
// @expect pass
// @stdout nested

type ScalarMetadata = {
  kind: 'scalar'
  name: string
}

type ObjectMetadata = {
  kind: 'object'
  dynamicField?: RecursiveMetadata | null
  dynamicFieldOwnership?: 'weak'
}

type RecursiveMetadata = ScalarMetadata | ObjectMetadata
type OpaqueMetadata = object

function storeOpaque(value: RecursiveMetadata): OpaqueMetadata {
  return value
}

function readOpaque(value: OpaqueMetadata | null | undefined): RecursiveMetadata | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value as RecursiveMetadata
}

function metadataName(value: ScalarMetadata): string {
  return value.name
}

const stored = storeOpaque({
  kind: 'object',
  dynamicField: {
    kind: 'scalar',
    name: 'nested'
  }
})
const metadata = readOpaque(stored)

if (metadata !== null && metadata.kind === 'object') {
  const nested = metadata.dynamicField

  if (nested !== null && typeof nested !== 'undefined' && nested.kind === 'scalar') {
    console.log(metadataName(nested))
  }
}
