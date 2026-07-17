// @targets cc
// @expect pass
// @stdout T,U

type NativeType = {
  typeParameters?: string[]
}

function fingerprint(value: string): string {
  return value
}

function parametersFingerprint(item: NativeType): string {
  return (item.typeParameters ?? []).map(fingerprint).join(',')
}

console.log(parametersFingerprint({ typeParameters: ['T', 'U'] }))
