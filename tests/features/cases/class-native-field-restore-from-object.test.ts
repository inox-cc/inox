// @targets cc
// @expect pass
// @stdout Ada

class Scope {
  name: string

  constructor(name: string) {
    this.name = name
  }

  label(): string {
    return this.name
  }
}

type ScopeState = {
  scope: Scope
}

class Holder {
  scope: Scope

  constructor() {
    this.scope = new Scope('Ada')
  }

  save(): ScopeState {
    return {
      scope: this.scope
    }
  }

  restore(previous: ScopeState): void {
    this.scope = previous.scope
  }

  label(): string {
    return this.scope.label()
  }
}

const holder = new Holder()
const previous = holder.save()
holder.restore(previous)
console.log(holder.label())
