// @targets cc
// @expect pass
// @stdout true:true:true

function value(): string {
  return 'inox'
}

function check(): void {
  const result = value()
  console.log(`${typeof result === 'string'}:${typeof result !== 'undefined'}:${result !== null}`)
}

check()
