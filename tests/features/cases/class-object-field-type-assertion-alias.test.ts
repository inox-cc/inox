// @targets cc
// @expect pass
// @stdout Ada

type Alias = {
  name: string
}

class Box {
  value: object

  constructor(value: object) {
    this.value = value
  }

  name(): string {
    const source = this.value
    const value = source as Alias

    return value.name
  }
}

const box = new Box({ name: 'Ada' })
console.log(box.name())
