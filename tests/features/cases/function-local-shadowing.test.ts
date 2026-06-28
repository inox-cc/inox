// @targets cc
// @expect pass
// @stdout inner
// @stdout outer

const value: string = 'outer'

function show(): void {
  const value: string = 'inner'
  console.log(value)
}

show()
console.log(value)
