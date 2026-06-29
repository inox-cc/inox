// @targets cc
// @expect pass
// @stdout Ada

class Box {
  payload: object

  constructor(payload: object) {
    this.payload = payload
  }
}

type Payload = {
  name: string
}

const payload: Payload = {
  name: 'Ada'
}
const box = new Box(payload)
const boxed: Payload = box.payload
console.log(boxed.name)
