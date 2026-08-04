// @targets cc
// @expect pass
// @stdout 1

let caught = false

try {
  Object.hasOwn(null, 'value')
} catch {
  caught = true
}

console.log(caught)
