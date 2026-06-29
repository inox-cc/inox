// @targets cc
// @expect pass
// @stdout Ada

class Registry {
  values: Map<string, string>

  constructor() {
    this.values = new Map()
  }
}

class Holder {
  registry: Registry
  marker: Set<string>

  constructor(registry: Registry) {
    this.registry = registry
    this.marker = new Set()
  }

  set(name: string, value: string): void {
    this.registry.values.set(name, value)
  }

  resolve(name: string): string | null {
    const value = this.registry.values.get(name)

    if (value !== null && typeof value !== 'undefined') {
      return value
    }

    return null
  }
}

const registry = new Registry()
const holder = new Holder(registry)
holder.set('Ada', 'Ada')
const name = holder.resolve('Ada')

if (name !== null) {
  console.log(name)
}
