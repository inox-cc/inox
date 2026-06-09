// @targets c
// @expect pass
// @stdout hello Ada

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Ada')
}

export function main(): void {
  const prefix = 'hello'
  const callback: StringCallback = (value: string) => {
    console.log(prefix, value)
  }
  run(callback)
}
