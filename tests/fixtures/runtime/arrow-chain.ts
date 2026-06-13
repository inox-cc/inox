// @targets js,c
// @expect pass

const values = [3, 1, 2]
const result = values.sort((left: number, right: number) => left - right).filter(value => value > 1).map(value => value * 2)
console.log(result[0], result[1])

