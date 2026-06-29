// @targets cc
// @expect pass
// @stdout ok

class Gate {
  enabled: boolean
  mode: string

  constructor(enabled: boolean, mode: string) {
    this.enabled = enabled
    this.mode = mode
  }

  label(): string {
    if (this.enabled && this.mode === 'open') {
      return 'ok'
    }

    return 'closed'
  }
}

const gate = new Gate(true, 'open')
console.log(gate.label())
