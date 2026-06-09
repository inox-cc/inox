// @targets c
// @expect pass
// @stdout Error boom

export function main(): void {
  const error = new Error('boom')
  console.log(error.name, error.message)
}
