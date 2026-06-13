// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_FUNCTION_VALUE

type Task = () => void

type Box = {
  task: Task
}

function hello(): void {
  console.log('hello')
}

export function main(): void {
  const box: Box = { task: hello }
  box.task()
}
