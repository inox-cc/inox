import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'

type RegExpFeatureSet = Set<IrFeature>

type RegExpFeatureNode = AnyNode & {
  regexpRuntimeMethod?: string | null
  type?: string | null
  valueType?: string | null
}

export const regexpFeatureId: IrFeature = 'regexp'
export const regexpFeatureRuntimeRequirements: IrRuntimeRequirement[] = []
export const regexpFeatureCPreludeIncludes: string[] = [
  '#include <regex.h>',
  '#include <stdlib.h>',
  '#include <string.h>'
]
export const regexpFeature: CompilerFeatureDescriptor = {
  id: regexpFeatureId,
  runtimeRequirements: regexpFeatureRuntimeRequirements,
  cPreludeIncludes: regexpFeatureCPreludeIncludes,
  hasCPreludeHelpers: true
}

export function collectRegExpIrFeatures(node: AnyNode, features: RegExpFeatureSet): void {
  const item = node as RegExpFeatureNode

  if (item.type === 'RegExpLiteral' || item.valueType === 'regexp') {
    features.add('regexp')
  }

  if (item.regexpRuntimeMethod === 'test') {
    features.add('regexp')
    features.add('string-bytes')
  }
}

export function emitCRegExpFlags(flags: string | null | undefined): string {
  if (flags !== null && typeof flags !== 'undefined' && flags.includes('i')) {
    return 'REG_ICASE'
  }

  return '0'
}

export function emitCRegExpPreludeHelpers(): string[] {
  return [
    'typedef struct inox_regexp_literal {',
    '  const char* pattern;',
    '  int flags;',
    '} inox_regexp_literal;',
    '',
    'static int inox_regexp_test(const char* pattern, int flags, const char* value_bytes, size_t value_len) {',
    '  regex_t regex;',
    '  int status = regcomp(&regex, pattern, REG_EXTENDED | flags);',
    '  if (status != 0) return 0;',
    '  if (value_len == (size_t)-1) {',
    '    regfree(&regex);',
    '    return 0;',
    '  }',
    '  char* value = (char*)malloc(value_len + 1);',
    '  if (value == 0) {',
    '    regfree(&regex);',
    '    return 0;',
    '  }',
    '  if (value_len > 0) memcpy(value, value_bytes, value_len);',
    '  value[value_len] = 0;',
    '  status = regexec(&regex, value, 0, 0, 0);',
    '  free(value);',
    '  regfree(&regex);',
    '  return status == 0;',
    '}'
  ]
}
