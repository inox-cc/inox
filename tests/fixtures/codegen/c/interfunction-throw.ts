// @targets c
// @expect pass
// @stdout boom

export function failString(): void {
  throw 'boom'
}

export function main(): void {
  try {
    failString()
  } catch (error) {
    console.log(error)
  }
}
