// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

type SourceText = {
  kind: string
  value: string
  nullable: boolean
}

type SourceObject = {
  kind: string
  payload: string
  nullable: boolean
}

type Source = SourceText | SourceObject

type TargetText = {
  kind: string
  value: string
  nullable: boolean
}

type TargetObject = {
  kind: string
  payload: string
  nullable: boolean
}

type Target = TargetText | TargetObject

function invalidOverride(value: Source): Target {
  const result: Target = { ...value, nullable: 'invalid' }
  return result
}
