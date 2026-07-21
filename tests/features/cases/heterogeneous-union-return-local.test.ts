// @targets cc
// @expect pass
// @stdout alpha

type Box = {
  value: string
}

function chooseBoxOrValues(boxed: boolean): Box | string[] {
  if (boxed) {
    return { value: 'box' }
  }

  return ['alpha']
}

const selected = chooseBoxOrValues(false)

if (Array.isArray(selected)) {
  console.log(selected[0])
} else {
  console.log(selected.value)
}
