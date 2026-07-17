function pushCPreludeLines(target: string[], source: string[]): void {
  for (let index = 0; index < source.length; index = index + 1) {
    target.push(source[index])
  }
}

function pushUniqueCPreludeLine(target: string[], line: string): void {
  for (let index = 0; index < target.length; index = index + 1) {
    if (target[index] === line) {
      return
    }
  }

  target.push(line)
}

function isCSystemIncludeLine(line: string): boolean {
  return line.slice(0, 10) === '#include <'
}

function pushCPreludeInclude(systemIncludes: string[], localIncludes: string[], line: string): void {
  if (isCSystemIncludeLine(line)) {
    pushUniqueCPreludeLine(systemIncludes, line)
    return
  }

  pushUniqueCPreludeLine(localIncludes, line)
}

function pushCPreludeIncludes(systemIncludes: string[], localIncludes: string[], lines: string[]): void {
  for (let index = 0; index < lines.length; index = index + 1) {
    pushCPreludeInclude(systemIncludes, localIncludes, lines[index])
  }
}

function pushLibraryCPreludeIncludes(systemIncludes: string[], localIncludes: string[], includes: string[]): void {
  for (let index = 0; index < includes.length; index = index + 1) {
    const include = includes[index]

    if (include.startsWith('#include ')) {
      pushCPreludeInclude(systemIncludes, localIncludes, include)
    } else if (include.startsWith('<')) {
      pushCPreludeInclude(systemIncludes, localIncludes, `#include ${include}`)
    } else {
      pushCPreludeInclude(systemIncludes, localIncludes, `#include "${include}"`)
    }
  }
}

function emitCPreludeIncludeLines(systemIncludes: string[], localIncludes: string[]): string[] {
  const lines: string[] = []

  pushCPreludeLines(lines, systemIncludes)
  pushCPreludeLines(lines, localIncludes)

  return lines
}

export function emitLibraryCPreludeIncludeLines(includes: string[]): string[] {
  const systemIncludes: string[] = []
  const localIncludes: string[] = []

  pushLibraryCPreludeIncludes(systemIncludes, localIncludes, includes)

  return emitCPreludeIncludeLines(systemIncludes, localIncludes)
}

export function filterUnusedCPreludeIncludes(code: string): string {
  const lines = code.split('\n')
  const body = cPreludeFilterBody(lines)
  const filtered: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]

    if (line === '#include "inox/allocator.h"' && !cPreludeBodyUsesAllocatorHeader(body)) {
      continue
    }

    if (line === '#include "inox/string.h"' && !cPreludeBodyUsesRuntimeStringHeader(body)) {
      continue
    }

    if (line === '#include <string.h>' && !cPreludeBodyUsesCStringHeader(body)) {
      continue
    }

    if (line === '#include <stdio.h>' && !cPreludeBodyUsesCStdioHeader(body)) {
      continue
    }

    if (line === '#include <math.h>' && !body.includes('fmod(')) {
      continue
    }

    filtered.push(line)
  }

  return filtered.join('\n')
}

function cPreludeFilterBody(lines: string[]): string {
  const body: string[] = []

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]

    if (line.startsWith('#include ')) {
      continue
    }

    body.push(line)
  }

  return body.join('\n')
}

function cPreludeBodyUsesAllocatorHeader(body: string): boolean {
  return (
    body.includes('inox_default_allocator') ||
    body.includes('inox_allocator') ||
    body.includes('inox_default_alloc') ||
    body.includes('inox_default_realloc') ||
    body.includes('inox_default_free')
  )
}

function cPreludeBodyUsesRuntimeStringHeader(body: string): boolean {
  return (
    body.includes('inox_string') ||
    body.includes('INOX_REF_STRING') ||
    body.includes('inox::String') ||
    body.includes('inox::StringView')
  )
}

function cPreludeBodyUsesCStringHeader(body: string): boolean {
  return (
    body.includes('strlen(') ||
    body.includes('memcpy(') ||
    body.includes('memcmp(') ||
    body.includes('memset(') ||
    body.includes('strcmp(') ||
    body.includes('strncmp(')
  )
}

function cPreludeBodyUsesCStdioHeader(body: string): boolean {
  return (
    body.includes('printf(') ||
    body.includes('fprintf(') ||
    body.includes('snprintf(') ||
    body.includes('vsnprintf(') ||
    body.includes('puts(') ||
    body.includes('fputs(') ||
    body.includes('fflush(') ||
    body.includes('FILE') ||
    body.includes('stdout') ||
    body.includes('stderr')
  )
}

export function emitCPrelude(
  needsRuntime: boolean,
  needsMainRuntime: boolean,
  needsAsyncRuntime: boolean,
  needsCallbackRuntime: boolean,
  needsClassDescriptorRuntime: boolean,
  needsCppValueRuntime: boolean,
  needsStringHeader: boolean,
  needsCollectionRuntime: boolean,
  needsObjectRuntime: boolean,
  libraryCPreludeIncludes: string[]
): string[] {
  const systemIncludes = ['#include <stdio.h>', '#include <math.h>']
  const localIncludes: string[] = []

  if (needsMainRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/main.h"')
  }

  if (needsCppValueRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/value.h"')
  }

  if (needsClassDescriptorRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/class_runtime.h"')
  }

  pushLibraryCPreludeIncludes(systemIncludes, localIncludes, libraryCPreludeIncludes)

  if (needsStringHeader) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include <string.h>')
  }

  if (needsCallbackRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include <new>')
  }

  if (needsRuntime) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/allocator.h"')
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/loop.h"')
    if (needsCallbackRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/callback.h"')
    }
    if (needsObjectRuntime) {
      pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/object.h"')
    }
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/string.h"')
  } else if (needsStringHeader) {
    pushCPreludeInclude(systemIncludes, localIncludes, '#include "inox/string.h"')
  }

  const lines = emitCPreludeIncludeLines(systemIncludes, localIncludes)

  lines.push('')

  return lines
}
