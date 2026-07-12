// @targets cc
// @expect pass
// @stdout 1

type Flags = { [key: string]: boolean }

function enable(values: Flags, key: string): void {
  values[key] = true
}

const values: Flags = { ready: false }
enable(values, 'ready')
console.log(values.ready)
