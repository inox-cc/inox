// @targets c
// @expect pass
// @stdout boom

export function failString(): void {
  throw 'boom'
}

try {
  failString()
} catch (error) {
  console.log(error)
}

