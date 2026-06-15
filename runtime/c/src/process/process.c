#include "ccjs/process.h"

#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "ccjs/string.h"

static int ccjs_process_argc = 0;
static char** ccjs_process_argv_values = 0;
static int ccjs_process_exit_code = 0;

static ccjs_status ccjs_process_string(ccjs_allocator* allocator, const char* value, ccjs_value* out) {
  return ccjs_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);
}

void ccjs_process_init(int argc, char** argv) {
  ccjs_process_argc = argc;
  ccjs_process_argv_values = argv;
}

ccjs_status ccjs_process_arch(ccjs_allocator* allocator, ccjs_value* out) {
#if defined(__aarch64__) || defined(_M_ARM64)
  return ccjs_process_string(allocator, "arm64", out);
#elif defined(__x86_64__) || defined(_M_X64)
  return ccjs_process_string(allocator, "x64", out);
#elif defined(__i386__) || defined(_M_IX86)
  return ccjs_process_string(allocator, "ia32", out);
#elif defined(__arm__) || defined(_M_ARM)
  return ccjs_process_string(allocator, "arm", out);
#elif defined(__riscv) && __riscv_xlen == 64
  return ccjs_process_string(allocator, "riscv64", out);
#elif defined(__powerpc64__) || defined(__ppc64__)
  return ccjs_process_string(allocator, "ppc64", out);
#elif defined(__s390x__)
  return ccjs_process_string(allocator, "s390x", out);
#else
  return ccjs_process_string(allocator, "unknown", out);
#endif
}

ccjs_status ccjs_process_argv(ccjs_allocator* allocator, int index, ccjs_value* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  if (index < 0 || index >= ccjs_process_argc || ccjs_process_argv_values == 0 || ccjs_process_argv_values[index] == 0) {
    return ccjs_string_from_literal(allocator, "", 0, out);
  }

  const char* value = ccjs_process_argv_values[index];

  return ccjs_string_from_literal(allocator, value, strlen(value), out);
}

int ccjs_process_argv_length(void) {
  return ccjs_process_argc;
}

ccjs_status ccjs_process_argv0(ccjs_allocator* allocator, ccjs_value* out) {
  return ccjs_process_argv(allocator, 0, out);
}

ccjs_status ccjs_process_cwd(ccjs_allocator* allocator, ccjs_value* out) {
  char cwd[4096];

  if (getcwd(cwd, sizeof(cwd)) == 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  return ccjs_string_from_literal(allocator, cwd, strlen(cwd), out);
}

ccjs_status ccjs_process_env(ccjs_allocator* allocator, const char* name, size_t name_len, ccjs_value* out) {
  if (name == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  char* key = allocator->alloc(allocator->user, name_len + 1, _Alignof(char));

  if (key == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(key, name, name_len);
  key[name_len] = 0;

  const char* value = getenv(key);
  ccjs_status status = ccjs_string_from_literal(allocator, value == 0 ? "" : value, value == 0 ? 0 : strlen(value), out);

  allocator->free(allocator->user, key, name_len + 1, _Alignof(char));

  return status;
}

ccjs_status ccjs_process_execPath(ccjs_allocator* allocator, ccjs_value* out) {
  return ccjs_process_argv(allocator, 0, out);
}

int ccjs_process_get_exit_code(void) {
  return ccjs_process_exit_code;
}

int ccjs_process_pid(void) {
#ifdef _WIN32
  return 0;
#else
  return (int)getpid();
#endif
}

ccjs_status ccjs_process_platform(ccjs_allocator* allocator, ccjs_value* out) {
#if defined(__APPLE__)
  return ccjs_process_string(allocator, "darwin", out);
#elif defined(__linux__)
  return ccjs_process_string(allocator, "linux", out);
#elif defined(_WIN32)
  return ccjs_process_string(allocator, "win32", out);
#elif defined(__FreeBSD__)
  return ccjs_process_string(allocator, "freebsd", out);
#elif defined(__OpenBSD__)
  return ccjs_process_string(allocator, "openbsd", out);
#elif defined(__sun)
  return ccjs_process_string(allocator, "sunos", out);
#elif defined(_AIX)
  return ccjs_process_string(allocator, "aix", out);
#else
  return ccjs_process_string(allocator, "unknown", out);
#endif
}

ccjs_status ccjs_process_version(ccjs_allocator* allocator, ccjs_value* out) {
  return ccjs_process_string(allocator, "v0.0.0-ccjs", out);
}

ccjs_status ccjs_process_versions_node(ccjs_allocator* allocator, ccjs_value* out) {
  return ccjs_process_string(allocator, "0.0.0-ccjs", out);
}

void ccjs_process_set_exit_code(int code) {
  ccjs_process_exit_code = code;
}

void ccjs_process_exit(int code) {
  exit(code);
}
