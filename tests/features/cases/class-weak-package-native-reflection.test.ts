// @targets cc
// @expect pass
// @stdout {"items":null}

class Holder {
  items: weak<Array<string> | null>

  constructor() {
    this.items = null
  }

  attach(items: Array<string>): void {
    this.items = items
  }
}

const holder = new Holder()

if (holder.items === null) {
  const items = ['temporary']
  holder.attach(items)
}

console.log(JSON.stringify(holder))
