// @targets cc
// @expect pass
// @stdout 0

type Scalar = string | number | boolean
type ExpectedType = 'string' | 'number' | 'boolean'
type Descriptor = {
  valueType: ExpectedType
}

function typeMismatch(descriptor: Descriptor, value: Scalar): boolean {
  return (
    (descriptor.valueType === 'string' && typeof value !== 'string') ||
    (descriptor.valueType === 'number' && typeof value !== 'number') ||
    (descriptor.valueType === 'boolean' && typeof value !== 'boolean')
  )
}

console.log(typeMismatch({ valueType: 'boolean' }, true))
