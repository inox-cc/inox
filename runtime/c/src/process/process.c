#include "ccjs/process.h"

#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "ccjs/string.h"

static int ccjs_process_argc = 0;
static char** ccjs_process_argv_values = 0;
static int ccjs_process_exit_code = 0;

void ccjs_process_init(int argc, char** argv) {
  ccjs_process_argc = argc;
  ccjs_process_argv_values = argv;
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

int ccjs_process_get_exit_code(void) {
  return ccjs_process_exit_code;
}

void ccjs_process_set_exit_code(int code) {
  ccjs_process_exit_code = code;
}

void ccjs_process_exit(int code) {
  exit(code);
}
