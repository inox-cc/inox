// @targets cc
// @expect pass
// @stdout same:none

type AnyNode = { [key: string]: any }

function commonStringField(values: AnyNode[], name: string): string | null {
  if (values.length === 0) {
    return null
  }

  const first = values[0][name]

  for (let index = 1; index < values.length; index = index + 1) {
    if (values[index][name] !== first) {
      return null
    }
  }

  return typeof first === 'string' ? first : null
}

console.log(
  `${commonStringField([{ kind: 'same' }, { kind: 'same' }], 'kind') ?? 'none'}:${
    commonStringField([{ kind: 'first' }, { kind: 'second' }], 'kind') ?? 'none'
  }`
)
