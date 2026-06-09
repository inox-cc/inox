// @targets c
// @expect pass
// @stdout Ada Ada Grace

type User = {
  name: string
}

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Grace')
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const callback: StringCallback = (value: string) => {
    console.log(name, user.name, value)
  }
  run(callback)
}
