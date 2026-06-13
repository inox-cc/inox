// @targets c
// @expect pass
// @stdout hello Ada

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Ada')
}

const prefix = 'hello'
const callback: StringCallback = (value: string) => {
  console.log(prefix, value)
}
run(callback)

