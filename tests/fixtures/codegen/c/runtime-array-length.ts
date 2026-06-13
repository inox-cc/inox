// @targets c
// @expect pass
// @stdout 3

type Box = {
  values: number[]
}

const box: Box = { values: [1, 2, 3] }
console.log(box.values.length)

