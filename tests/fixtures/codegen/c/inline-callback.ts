// @targets c
// @expect pass
// @stdout inline

function run(callback: Function): void {
  callback()
}

export function main(): void {
  run(() => {
    console.log('inline')
  })
}
