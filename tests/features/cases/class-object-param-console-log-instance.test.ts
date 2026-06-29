// @targets cc
// @expect pass
// @stdout Box { value: 7 }

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

function printObject(value: object): void {
  console.log(value)
}

printObject(new Box(7))
