// @targets cc
// @expect pass
// @stdout Ada

class Registry {
  values: Map<string, string>

  constructor() {
    this.values = new Map()
  }

  set(name: string, value: string): void {
    this.values.set(name, value)
  }

  resolve(name: string): string | null {
    const value = this.values.get(name)

    if (value !== null && typeof value !== 'undefined') {
      return value
    }

    return null
  }
}

class Holder {
  registry: Registry
  metadata: unknown

  constructor(registry: Registry) {
    this.registry = registry
    this.metadata = null
  }

  resolve(name: string): string | null {
    return this.registry.resolve(name)
  }
}

const registry = new Registry()
registry.set('Ada', 'Ada')
const holder = new Holder(registry)
const name = holder.resolve('Ada')

if (name !== null) {
  console.log(name)
}
