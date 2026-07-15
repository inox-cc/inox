// @targets cc
// @expect pass
// @stdout Ada
// @stdout Ada

function createNames(): Set<string> {
  return new Set<string>(['Ada'])
}

function logNames(names: Set<string>): void {
  for (const name of names) {
    console.log(name)
  }
}

class NameBox {
  names: Set<string>

  constructor(names: Set<string>) {
    this.names = names
  }

  log(): void {
    for (const name of this.names) {
      console.log(name)
    }
  }
}

const names = createNames()
logNames(names)
const box = new NameBox(names)
box.log()
