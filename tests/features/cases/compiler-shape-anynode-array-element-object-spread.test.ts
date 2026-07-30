// @targets cc
// @expect pass
// @stdout ok

type AnyNode = { [key: string]: any }

function copyFirst(values: AnyNode[]): AnyNode {
  if (values.length === 0) {
    return { copied: false }
  }

  const value = values[0]

  return {
    ...value,
    copied: true
  }
}

console.log(copyFirst([{ name: 'ok' }]).name)
