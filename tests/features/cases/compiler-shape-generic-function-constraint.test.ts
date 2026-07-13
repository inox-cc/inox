// @targets cc
// @expect pass
// @stdout Ada

type Payload = {
  name: string
}

function render<T extends Payload>(value: T): string {
  return value.name
}

const payload: Payload = { name: 'Ada' }
console.log(render(payload))
