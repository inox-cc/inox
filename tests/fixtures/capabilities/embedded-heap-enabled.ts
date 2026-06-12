// @targets c
// @platforms embedded
// @features arrays,heap
// @expect pass

export function main(): void {
  const values = [1, 2, 3]
  const result = values.filter(value => value > 1).map(value => value + 1)

  console.log(result.length)
}
