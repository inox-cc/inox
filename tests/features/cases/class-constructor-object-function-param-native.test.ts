// @targets cc
// @expect pass
// @stdout 0

type RunnerDeps = {
  prepare: (value: string) => string
}

class Runner {
  deps: RunnerDeps
  markers: Set<string>

  constructor(deps: RunnerDeps) {
    this.deps = deps
    this.markers = new Set()
  }

  size(): number {
    return this.markers.size
  }
}

const runner = new Runner({
  prepare: (value) => value
})

console.log(runner.size())
