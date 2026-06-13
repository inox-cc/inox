// @targets c
// @expect pass
// @stdout 1 7

type Callback = (value: number) => number;

let marker = 0
const callback: Callback | null = (value: number) => {
  try {
    return value
  } finally {
    marker = 7
  }
}

const value: number | null = callback?.(1)
console.log(value ?? 0, marker)

