// @targets cc
// @expect pass
// @stdout Label(one)
// @stdout { label: Label(one) }

class Label {
  value: string

  constructor(value: string) {
    this.value = value
  }

  toString(): string {
    return `Label(${this.value})`
  }
}

const label = new Label('one')

console.log(label)
console.log({ label })
