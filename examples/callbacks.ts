// @targets c
// @expect pass
// @stdout callbacks 9

type NumberCallback = (value: number) => void

function each(values: Array<number>, callback: NumberCallback): void {
  for (const value of values) {
    callback(value)
  }
}

export function main(): void {
  const offset = 5
  const values = [1, 2, 3]
    .filter(value => value > 1)
    .map(value => value * 2)

  each(values, value => {
    if (value === 4) {
      console.log('callbacks', value + offset)
    }
  })
}
