// @targets cc
// @expect pass
// @stdout ready

type Box = {
  readonly value: string | null
}

function read(): string {
  const box: Box = { value: 'ready' }
  const present = box.value !== null

  if (present) {
    return box.value
  }

  return 'missing'
}

console.log(read())
