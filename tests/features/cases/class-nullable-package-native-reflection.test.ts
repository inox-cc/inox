// @targets cc
// @expect pass
// @stdout {"items":["value"]}

class Holder {
  items: Array<string> | null

  constructor(items: Array<string> | null) {
    this.items = items
  }
}

console.log(JSON.stringify(new Holder(['value'])))
