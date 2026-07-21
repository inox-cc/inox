// @targets cc
// @expect pass
// @stdout 2:ready

function render(template: string, values: { count: string; value: string }): string {
  return template.split('$count').join(values.count).split('$value').join(values.value)
}

console.log(render('$count:$value', { count: '2', value: 'ready' }))
