import { nextCName } from '../context.ts'

type SliceCNameContext = {
  nextId: number
}

export function emitSliceIndexNormalizationLines(
  rawName: string,
  lengthName: string,
  outName: string,
  context: SliceCNameContext,
  prefix: string
): string[] {
  const integerName = nextCName(context, `${prefix}_integer`)
  const fromEndName = nextCName(context, `${prefix}_from_end`)

  return [
    `size_t ${outName} = 0;`,
    `if (${rawName} != ${rawName}) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} <= -((double)${lengthName})) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} >= ((double)${lengthName})) {`,
    `  ${outName} = ${lengthName};`,
    '} else {',
    `  long long ${integerName} = (long long)${rawName};`,
    `  if (${integerName} < 0) {`,
    `    long long ${fromEndName} = (long long)${lengthName} + ${integerName};`,
    `    ${outName} = ${fromEndName} < 0 ? 0 : (size_t)${fromEndName};`,
    '  } else {',
    `    ${outName} = (size_t)${integerName};`,
    '  }',
    '}'
  ]
}
