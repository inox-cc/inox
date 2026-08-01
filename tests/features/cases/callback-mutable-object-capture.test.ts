// @targets cc
// @expect pass
// @stdout after

type Reader = {
  read: () => string
}

let state = {
  value: 'before'
}

const reader: Reader = {
  read: () => state.value
}

state = {
  value: 'after'
}

console.log(reader.read())
