// @targets cc
// @expect pass
// @stdout 1

const bytes = new Uint8Array(2)
let caught = false

try {
  bytes.set([1, 2], 1)
} catch {
  caught = true
}

console.log(caught)
