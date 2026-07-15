// @targets cc
// @expect pass
// @stdout OK

function upper(value: string): string {
  return value.toUpperCase()
}

class Runner {
  callback: (value: string) => string

  constructor(callback: (value: string) => string) {
    this.callback = callback
  }

  run(value: string): string {
    return this.callback(value)
  }
}

console.log(new Runner(upper).run('ok'))
