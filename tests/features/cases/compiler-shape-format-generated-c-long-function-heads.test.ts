// @targets c
// @expect pass
// @stdout 1
// @stdout 1
// @stdout 1

import { formatGeneratedC } from '../../../compiler/c/format.ts'

function generatedFunctionHead(index: number): string {
  return `inox_value generated_callback_wrapper_${index}(inox_value context, inox_value args, inox_value out, inox_value dep0, inox_value dep1, inox_value dep2, inox_value dep3) {`
}

const code = ''

function generatedCode(): string {
  let output = ''

  for (let index = 0; index < 240; index = index + 1) {
    const head = generatedFunctionHead(index)

    output = output + head + '\n  return inox_undefined_value();\n}\n'
  }

  return output
}

function run(): void {
  const seedIsEmpty = code === ''
  const formatted = formatGeneratedC(generatedCode(), 'generated.c')
  const lines = formatted.split('\n')

  console.log(seedIsEmpty)
  console.log(lines.length > 240)
  console.log(formatted.includes('generated_callback_wrapper_239'))
}

run()
