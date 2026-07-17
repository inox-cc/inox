// @targets cc
// @expect pass
// @stdout alias

type AnyNode = {
  [key: string]: any
}

type MetadataNode = {
  [key: string]: any
}

function metadataKind(node: AnyNode): string {
  const metadata = node.valueType as MetadataNode

  return metadata.kind
}

console.log(metadataKind({ valueType: { kind: 'alias' } }))
