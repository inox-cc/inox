// @targets cc
// @expect pass
// @stdout Box { value: 7 }

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

try {
  throw new Box(7)
} catch (error) {
  console.log(error)
}
