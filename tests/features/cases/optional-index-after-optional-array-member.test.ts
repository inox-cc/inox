// @targets cc
// @expect pass
// @stdout string

type AnyNode = {
  [key: string]: unknown
  type?: string
}

function firstParamValueType(callback: AnyNode | null): string | null {
  return callback?.params?.[0]?.valueType ?? null
}

console.log(firstParamValueType({ params: [{ valueType: 'string' }] }))
