// @targets cc
// @expect pass
// @stdout left:value

type Left = {
  kind: 'left'
  left: string
}

type Right = {
  kind: 'right'
  right: string
}

type Holder = {
  value: Left | Right
}

function describe(holder: Holder): string {
  const value = holder.value

  if (value.kind === 'left') {
    return `${value.kind}:${value.left}`
  }

  return `${value.kind}:${value.right}`
}

console.log(describe({ value: { kind: 'left', left: 'value' } }))
