// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

type Cell = {
  value?: string
}

function replace(cells: Cell[]): string {
  if (typeof cells[0].value === 'string') {
    cells[0] = {}
    return cells[0].value
  }

  return 'missing'
}

replace([{ value: 'stale' }])
