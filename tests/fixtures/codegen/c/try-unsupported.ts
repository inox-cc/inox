// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_TRY

type Callback = (name: string) => number;

export function main(): void {
  const callback: Callback = (name: string) => {
    try {
      return 1
    } finally {
      console.log(name)
    }
  }

  callback('Ada')
}
