// @targets c
// @expect pass
// @stdout 6

export async function main(): Promise<void> {
  const total = Promise.resolve(3).then(value => {
    let sum = 0

    while (value > 0) {
      sum = sum + value
      value = value - 1
    }

    return sum
  })

  console.log(await total)
}
