// @targets c
// @expect pass
// @stdout 2 1 Ada

type Box = {
  values: number[],
  flags: boolean[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], flags: [true], names: ['Ada'] }
  const name = box.names[0]
  console.log(box.values[1], box.flags[0], name)
}
