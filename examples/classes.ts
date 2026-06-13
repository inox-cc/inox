// @targets c
// @expect pass
// @stdout ccjs 7 1

class Counter {
  readonly name: string
  readonly start: number

  constructor(name: string, start: number) {
    this.name = name
    this.start = start
  }

  add(value: number): number {
    return this.start + value
  }

  total(value: number): number {
    return this.add(value)
  }

  label(): string {
    return this.name
  }

  hasStart(value: number): boolean {
    return this.start === value
  }
}

const counter = new Counter('ccjs', 3)
console.log(counter.label(), counter.total(4), counter.hasStart(3))
