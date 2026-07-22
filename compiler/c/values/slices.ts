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
    `} else if (${rawName} <= -static_cast<double>(${lengthName})) {`,
    `  ${outName} = 0;`,
    `} else if (${rawName} >= static_cast<double>(${lengthName})) {`,
    `  ${outName} = ${lengthName};`,
    '} else {',
    `  long long ${integerName} = static_cast<long long>(${rawName});`,
    `  if (${integerName} < 0) {`,
    `    long long ${fromEndName} = static_cast<long long>(${lengthName}) + ${integerName};`,
    `    ${outName} = ${fromEndName} < 0 ? 0 : static_cast<size_t>(${fromEndName});`,
    '  } else {',
    `    ${outName} = static_cast<size_t>(${integerName});`,
    '  }',
    '}'
  ]
}
