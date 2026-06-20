// @targets c
// @expect pass
// @stdout Ada

const name = 'Ada'
const callback: Function = () => {
  console.log(name)
}

callback()
