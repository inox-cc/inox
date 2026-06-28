// @targets cc
// @expect pass
// @stdout target

function render(value: string, seenTypes: string[] = []): string {
  if (seenTypes.length === 0) {
    return value
  }

  return seenTypes[0]
}

console.log(render('target'))
