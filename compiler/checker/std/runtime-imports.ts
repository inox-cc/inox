import { isUnsupportedBufferRuntimeExport } from '../../stdlib/descriptors/binary.ts'
import {
  isChildProcessRuntimeMethod,
  isUnsupportedChildProcessRuntimeMethod
} from '../../stdlib/descriptors/child-process.ts'
import { isUnsupportedEventsRuntimeExport } from '../../stdlib/descriptors/events.ts'
import {
  isStdlibModuleImportSourceForId,
  isStdlibModuleRuntimeImportBinding
} from '../../stdlib/descriptors/modules.ts'
import {
  isOsRuntimeConstant,
  isOsRuntimeMethod,
  isUnsupportedOsRuntimeMethod
} from '../../stdlib/descriptors/os.ts'
import {
  isPathRuntimeConstant,
  isPathRuntimeMethod,
  isUnsupportedPathRuntimeMethod
} from '../../stdlib/descriptors/path.ts'
import {
  isProcessRuntimeMethod,
  isUnsupportedProcessRuntimeMethod,
  processRuntimePropertyValueType
} from '../../stdlib/descriptors/process.ts'
import { isUnsupportedStreamRuntimeExport } from '../../stdlib/descriptors/stream.ts'
import { isTimerRuntimeMethod } from '../../stdlib/descriptors/timers.ts'
import {
  isUnsupportedUrlRuntimeMethod,
  isUrlRuntimeConstructor,
  isUrlRuntimeMethod
} from '../../stdlib/descriptors/url.ts'
import type { ValueType } from '../../types.ts'

export function runtimeImportValueType(source: string, importedName: string): ValueType {
  if (isStdlibModuleImportSourceForId(source, 'os')) {
    return osRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'path')) {
    return pathRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'url')) {
    return urlRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'process')) {
    return processRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'child-process')) {
    return childProcessRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'buffer')) {
    return bufferRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'events')) {
    return eventsRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'stream')) {
    return streamRuntimeImportValueType(source, importedName)
  }

  if (isStdlibModuleImportSourceForId(source, 'timers')) {
    return timersRuntimeImportValueType(source, importedName)
  }

  return 'unknown'
}

function osRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (isOsRuntimeConstant(importedName)) {
    return 'string'
  }

  if (isOsRuntimeMethod(importedName) || isUnsupportedOsRuntimeMethod(importedName)) {
    return 'function'
  }

  if (isStdlibModuleRuntimeImportBinding(source, 'os', 'module-object', importedName)) {
    return 'object'
  }

  return 'unknown'
}

function pathRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (isPathRuntimeConstant(importedName)) {
    return 'string'
  }

  if (isPathRuntimeMethod(importedName) || isUnsupportedPathRuntimeMethod(importedName)) {
    return 'function'
  }

  if (
    isStdlibModuleRuntimeImportBinding(source, 'path', 'module-object', importedName) ||
    importedName === 'posix'
  ) {
    return 'object'
  }

  return 'unknown'
}

function urlRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (
    isUrlRuntimeMethod(importedName) ||
    isUrlRuntimeConstructor(importedName) ||
    isUnsupportedUrlRuntimeMethod(importedName)
  ) {
    return 'function'
  }

  if (isStdlibModuleRuntimeImportBinding(source, 'url', 'module-object', importedName)) {
    return 'object'
  }

  return 'unknown'
}

function processRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (isProcessRuntimeMethod(importedName) || isUnsupportedProcessRuntimeMethod(importedName)) {
    return 'function'
  }

  const propertyType = processRuntimePropertyValueType(importedName)

  if (propertyType !== null && typeof propertyType !== 'undefined') {
    return propertyType
  }

  if (isStdlibModuleRuntimeImportBinding(source, 'process', 'module-object', importedName)) {
    return 'object'
  }

  return 'unknown'
}

function childProcessRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (isChildProcessRuntimeMethod(importedName) || isUnsupportedChildProcessRuntimeMethod(importedName)) {
    return 'function'
  }

  if (isStdlibModuleRuntimeImportBinding(source, 'child-process', 'module-object', importedName)) {
    return 'object'
  }

  return 'unknown'
}

function bufferRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (
    importedName === 'Buffer' ||
    isStdlibModuleRuntimeImportBinding(source, 'buffer', 'module-object', importedName) ||
    importedName === 'constants'
  ) {
    return 'object'
  }

  if (isUnsupportedBufferRuntimeExport(importedName)) {
    return 'function'
  }

  return 'unknown'
}

function eventsRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (isStdlibModuleRuntimeImportBinding(source, 'events', 'module-object', importedName)) {
    return 'object'
  }

  if (isUnsupportedEventsRuntimeExport(importedName)) {
    return 'function'
  }

  return 'unknown'
}

function streamRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (
    isStdlibModuleRuntimeImportBinding(source, 'stream', 'module-object', importedName) ||
    importedName === 'promises'
  ) {
    return 'object'
  }

  if (isUnsupportedStreamRuntimeExport(importedName)) {
    return 'function'
  }

  return 'unknown'
}

function timersRuntimeImportValueType(source: string, importedName: string): ValueType {
  if (isTimerRuntimeMethod(importedName)) {
    return 'function'
  }

  if (isStdlibModuleRuntimeImportBinding(source, 'timers', 'module-object', importedName)) {
    return 'object'
  }

  return 'unknown'
}
