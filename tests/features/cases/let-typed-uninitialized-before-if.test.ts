// @targets cc
// @expect pass
// @stdout ready

let value: string

if (true) {
  value = 'ready'
}

console.log(value)
