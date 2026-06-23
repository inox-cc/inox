// @targets c
// @expect pass
// @stdout diag:E7:line=3:main

function fileName(path: string): string {
  return path
}

const code = 'E7'
const line = 1 + 2
const detail = `${code}:line=${line}`
const message = `diag:${detail}:${fileName('main')}`
console.log(message)
