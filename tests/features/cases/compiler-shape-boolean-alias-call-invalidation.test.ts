// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

type Box = {
  readonly value: string | null
}

function unknownEffect(): void {}

function read(): string {
  const box: Box = { value: 'ready' }
  const present = box.value !== null

  unknownEffect()

  if (present) {
    return box.value
  }

  return 'missing'
}

read()
