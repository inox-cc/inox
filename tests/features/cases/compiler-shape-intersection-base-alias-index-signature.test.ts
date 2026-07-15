// @targets cc
// @expect pass
// @stdout ok

type DynamicFields = {
  [key: string]: string
}

type DynamicFieldsAlias = DynamicFields

type ExtendedFields = DynamicFieldsAlias & {
  known?: string
}

function readDynamicField(value: ExtendedFields): string {
  return value.custom
}

console.log(readDynamicField({ custom: 'ok' }))
