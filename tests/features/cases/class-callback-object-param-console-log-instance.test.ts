// @targets cc
// @expect pass
// @stdout Box { value: 7 }

class Box {
  value: number

  constructor(value: number) {
    this.value = value
  }
}

type Reporter = (value: object) => void

function invoke(callback: Reporter, value: object): void {
  callback(value)
}

invoke((value: object) => {
  console.log(value)
}, new Box(7))
