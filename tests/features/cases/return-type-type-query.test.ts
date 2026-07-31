// @targets cc
// @expect pass
// @stdout ADA

function makeName(): string {
  return 'Ada'
}

type Name = ReturnType<typeof makeName>

function printName(): void {
  const name: Name = makeName()
  console.log(name.toUpperCase())
}

printName()
