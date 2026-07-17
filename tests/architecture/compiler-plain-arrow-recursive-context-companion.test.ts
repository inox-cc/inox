import assert from 'node:assert/strict'
import { test } from 'node:test'

import { emitPlainArrowCallbackWrapperHead } from '../../compiler/c/async/callbacks.ts'
import type { CPlainArrowCallbackWrapper } from '../../compiler/c/types.ts'

test('plain arrow wrapper keeps recursive compiler context companion parameters', () => {
  const wrapper: CPlainArrowCallbackWrapper = {
    kind: 'plain-arrow',
    key: 'resolver-wrapper',
    name: 'resolver_wrapper',
    expression: { type: 'ArrowFunctionExpression' },
    functionType: {
      kind: 'function',
      params: [
        {
          name: 'context',
          valueType: 'object',
          declaredType: 'CFunctionContext',
          shape: {
            fields: [
              {
                name: 'statementLoweringDependencies',
                valueType: 'object',
                declaredType: 'StatementLoweringDependencies',
                shape: {
                  fields: [
                    {
                      name: 'resolveRuntimeStringReference',
                      valueType: 'function',
                      functionType: {
                        kind: 'function',
                        params: [
                          {
                            name: 'expression',
                            valueType: 'object',
                            declaredType: 'StatementNode',
                            shape: { fields: [] }
                          },
                          {
                            name: 'context',
                            valueType: 'object',
                            declaredType: 'CFunctionContext',
                            shape: { fields: [] }
                          }
                        ],
                        returnNullable: true,
                        returnType: 'string'
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      ],
      returnType: 'void'
    }
  }

  assert.match(
    emitPlainArrowCallbackWrapperHead(wrapper),
    /inox_objfn_inox_arg_0_statementLoweringDependencies_resolveRuntimeStringReference/
  )
})
