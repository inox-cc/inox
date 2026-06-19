// @targets c
// @expect diagnostic
// @diagnostic INOX_C_FUNCTION_VALUE

type Task = () => void

function hello(): void {
  console.log('hello')
}

const tasks: Task[] = [hello]
const task = tasks[0]
task()
