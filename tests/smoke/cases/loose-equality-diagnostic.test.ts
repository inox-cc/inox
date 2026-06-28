// @targets cc
// @expect diagnostics INOX_UNSUPPORTED_OPERATOR

function compare(value: number): void {
  if (value == 1) {
    console.log(value)
  }

  if (value != 2) {
    console.log(value + 1)
  }
}

compare(1)
