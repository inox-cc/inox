// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

function invalid(): void {
  const values: { [key: string]: number } = { score: 'high' }
  console.log(values)
}
