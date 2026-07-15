// @targets cc
// @expect pass
// @stdout Box { value: 7 }

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

function throwBox(): void {
  throw new Box(7)
}

try {
  try {
    throwBox()
  } catch (error) {
    throw error
  }
} catch (error) {
  console.log(error)
}
