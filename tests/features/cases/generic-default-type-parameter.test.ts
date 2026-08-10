// @targets cc
// @expect pass
// @stdout default 3

type Box<T extends string | number = string> = {
  value: T
}

const defaultBox: Box = { value: 'default' }
const numberBox: Box<number> = { value: 3 }

console.log(defaultBox.value, numberBox.value)
