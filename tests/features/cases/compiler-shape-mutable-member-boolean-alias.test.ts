// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

type Box = {
  value: string | null
}

function read(box: Box): string {
  const present = box.value !== null

  if (present) {
    return box.value
  }

  return 'missing'
}

read({ value: 'ready' })
