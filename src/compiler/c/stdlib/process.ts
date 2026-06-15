import {
  isProcessRuntimeNumberProperty,
  isProcessRuntimeStringProperty,
  processRuntimePropertyValueType
} from '../../stdlib/descriptors/process.ts'

export function cProcessRuntimeMethodName(expression: any): string | null {
  if (expression?.type !== 'CallExpression' || typeof expression.processRuntimeMethod !== 'string') {
    return null
  }

  return expression.processRuntimeMethod
}

export function cProcessRuntimePropertyName(expression: any): string | null {
  if (typeof expression?.processRuntimeProperty !== 'string') {
    return null
  }

  return expression.processRuntimeProperty
}

export function cProcessRuntimePropertyValueType(expression: any): 'string' | 'number' | 'object' | null {
  const property = cProcessRuntimePropertyName(expression)

  return property == null ? null : processRuntimePropertyValueType(property)
}

export function cProcessRuntimeStringPropertyName(expression: any): string | null {
  const property = cProcessRuntimePropertyName(expression)

  return property != null && isProcessRuntimeStringProperty(property) ? property : null
}

export function cProcessRuntimeNumberPropertyName(expression: any): string | null {
  const property = cProcessRuntimePropertyName(expression)

  return property != null && isProcessRuntimeNumberProperty(property) ? property : null
}

export function cProcessRuntimeStringFunctionName(property: string): string | null {
  if (property === 'versions.node') {
    return 'versions_node'
  }

  return isProcessRuntimeStringProperty(property) ? property : null
}

export function cProcessRuntimeEnvName(expression: any): string | null {
  return typeof expression?.processRuntimeEnvName === 'string' ? expression.processRuntimeEnvName : null
}
