// @targets cc
// @expect pass
// @stdout fallback value

function text(value: string | null, fallback: string): string {
  let selected = value

  if (selected === null) {
    selected = fallback
  }

  return selected
}

console.log(text(null, 'fallback'), text('value', 'fallback'))
