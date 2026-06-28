#include "inox/process.h"

#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "inox/string.h"

static int inox_process_argc = 0;
static char** inox_process_argv_values = 0;
static const char* inox_process_entry_path = 0;
static int inox_process_exit_code = 0;

static inox_status inox_process_string(inox_allocator* allocator, const char* value, inox_value* out) {
  return inox_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);
}

void inox_process_init(int argc, char** argv) {
  inox_process_argc = argc;
  inox_process_argv_values = argv;
  inox_process_entry_path = 0;
}

void inox_process_init_with_entry(int argc, char** argv, const char* entry_path) {
  inox_process_argc = argc;
  inox_process_argv_values = argv;
  inox_process_entry_path = entry_path;
}

static int inox_process_argv_native_index(int index) {
  if (inox_process_entry_path != 0 && index > 1) {
    return index - 1;
  }

  return index;
}

static const char* inox_process_argv_value_at(int index) {
  if (index < 0) {
    return 0;
  }

  if (inox_process_entry_path != 0 && index == 1) {
    return inox_process_entry_path;
  }

  if (inox_process_argv_values == 0) {
    return 0;
  }

  int native_index = inox_process_argv_native_index(index);

  if (native_index < 0 || native_index >= inox_process_argc || inox_process_argv_values[native_index] == 0) {
    return 0;
  }

  return inox_process_argv_values[native_index];
}

inox_status inox_process_arch(inox_allocator* allocator, inox_value* out) {
#if defined(__aarch64__) || defined(_M_ARM64)
  return inox_process_string(allocator, "arm64", out);
#elif defined(__x86_64__) || defined(_M_X64)
  return inox_process_string(allocator, "x64", out);
#elif defined(__i386__) || defined(_M_IX86)
  return inox_process_string(allocator, "ia32", out);
#elif defined(__arm__) || defined(_M_ARM)
  return inox_process_string(allocator, "arm", out);
#elif defined(__riscv) && __riscv_xlen == 64
  return inox_process_string(allocator, "riscv64", out);
#elif defined(__powerpc64__) || defined(__ppc64__)
  return inox_process_string(allocator, "ppc64", out);
#elif defined(__s390x__)
  return inox_process_string(allocator, "s390x", out);
#else
  return inox_process_string(allocator, "unknown", out);
#endif
}

inox_status inox_process_argv(inox_allocator* allocator, int index, inox_value* out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  const char* value = inox_process_argv_value_at(index);

  if (value == 0) {
    return inox_string_from_literal(allocator, "", 0, out);
  }

  return inox_string_from_literal(allocator, value, strlen(value), out);
}

int inox_process_argv_length(void) {
  if (inox_process_entry_path != 0) {
    return inox_process_argc + 1;
  }

  return inox_process_argc;
}

inox_status inox_process_argv0(inox_allocator* allocator, inox_value* out) {
  return inox_process_argv(allocator, 0, out);
}

inox_status inox_process_cwd(inox_allocator* allocator, inox_value* out) {
  char cwd[4096];

  if (getcwd(cwd, sizeof(cwd)) == 0) {
    return INOX_ERR_UNSUPPORTED;
  }

  return inox_string_from_literal(allocator, cwd, strlen(cwd), out);
}

inox_status inox_process_env(inox_allocator* allocator, const char* name, size_t name_len, inox_value* out) {
  if (name == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  char* key = allocator->alloc(allocator->user, name_len + 1, _Alignof(char));

  if (key == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(key, name, name_len);
  key[name_len] = 0;

  const char* value = getenv(key);
  inox_status status = inox_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);

  allocator->free(allocator->user, key, name_len + 1, _Alignof(char));

  return status;
}

inox_status inox_process_execPath(inox_allocator* allocator, inox_value* out) {
  return inox_process_argv(allocator, 0, out);
}

int inox_process_get_exit_code(void) {
  return inox_process_exit_code;
}

int inox_process_pid(void) {
#ifdef _WIN32
  return 0;
#else
  return (int)getpid();
#endif
}

inox_status inox_process_platform(inox_allocator* allocator, inox_value* out) {
#if defined(__APPLE__)
  return inox_process_string(allocator, "darwin", out);
#elif defined(__linux__)
  return inox_process_string(allocator, "linux", out);
#elif defined(_WIN32)
  return inox_process_string(allocator, "win32", out);
#elif defined(__FreeBSD__)
  return inox_process_string(allocator, "freebsd", out);
#elif defined(__OpenBSD__)
  return inox_process_string(allocator, "openbsd", out);
#elif defined(__sun)
  return inox_process_string(allocator, "sunos", out);
#elif defined(_AIX)
  return inox_process_string(allocator, "aix", out);
#else
  return inox_process_string(allocator, "unknown", out);
#endif
}

inox_status inox_process_version(inox_allocator* allocator, inox_value* out) {
  return inox_process_string(allocator, "v0.0.0-inox", out);
}

inox_status inox_process_versions_node(inox_allocator* allocator, inox_value* out) {
  return inox_process_string(allocator, "0.0.0-inox", out);
}

void inox_process_set_exit_code(int code) {
  inox_process_exit_code = code;
}

void inox_process_exit(int code) {
  exit(code);
}
