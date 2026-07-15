// @targets cc
// @expect pass
// @stdout x

type Inner = {
  transform(value: string): string
}

type Carrier = {
  run(deps: Inner, label?: string): string
}

function transform(value: string): string {
  return value
}

function implementation(deps: Inner, label?: string): string {
  return deps.transform(label ?? 'x')
}

const inner: Inner = { transform }
const carrier: Carrier = { run: implementation }

function consume(value: Carrier, deps: Inner): string {
  return value.run(deps)
}

console.log(consume(carrier, inner))
