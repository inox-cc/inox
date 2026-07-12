// @targets cc
// @expect pass
// @stdout 1

type Flags = { [key: string]: boolean }

function enabled(values: Flags, key: string): boolean {
  return values[key] === true
}

console.log(enabled({ ready: true }, 'ready'))
