#include "ccjs/child_process.h"

#include <stdio.h>
#include <string.h>
#include "ccjs/string.h"

static ccjs_status ccjs_child_process_string(ccjs_value value, const char** bytes, size_t* len);
static ccjs_status ccjs_child_process_run(ccjs_allocator* allocator, const char* command, size_t command_len, ccjs_value* out);
static ccjs_status ccjs_child_process_build_exec_file_command(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  char** out,
  size_t* out_len
);
static size_t ccjs_child_process_shell_quoted_len(const char* bytes, size_t len);
static void ccjs_child_process_shell_quote(char* out, size_t* offset, const char* bytes, size_t len);
static char* ccjs_child_process_alloc(ccjs_allocator* allocator, size_t len);

ccjs_status ccjs_child_process_exec_sync(ccjs_allocator* allocator, ccjs_value command, ccjs_value* out) {
  const char* bytes = 0;
  size_t len = 0;
  ccjs_status status = ccjs_child_process_string(command, &bytes, &len);

  return status == CCJS_OK ? ccjs_child_process_run(allocator, bytes, len, out) : status;
}

ccjs_status ccjs_child_process_exec_file_sync(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  ccjs_value* out
) {
  char* command = 0;
  size_t command_len = 0;
  ccjs_status status = ccjs_child_process_build_exec_file_command(allocator, file, args, arg_count, &command, &command_len);

  if (status != CCJS_OK) {
    return status;
  }

  status = ccjs_child_process_run(allocator, command, command_len, out);
  allocator->free(allocator->user, command, command_len + 1, _Alignof(char));

  return status;
}

static ccjs_status ccjs_child_process_string(ccjs_value value, const char** bytes, size_t* len) {
  if (bytes == 0 || len == 0 || value.tag != CCJS_TAG_STRING || value.as.ref == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_string* string = (ccjs_string*)value.as.ref;
  *bytes = string->bytes;
  *len = string->len;

  return CCJS_OK;
}

static ccjs_status ccjs_child_process_run(ccjs_allocator* allocator, const char* command, size_t command_len, ccjs_value* out) {
  char* nul_command = ccjs_child_process_alloc(allocator, command_len);

  if (nul_command == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(nul_command, command, command_len);

  FILE* pipe = popen(nul_command, "r");
  allocator->free(allocator->user, nul_command, command_len + 1, _Alignof(char));

  if (pipe == 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  size_t len = 0;
  size_t capacity = 256;
  char* bytes = ccjs_child_process_alloc(allocator, capacity);

  if (bytes == 0) {
    pclose(pipe);
    return CCJS_ERR_OOM;
  }

  for (;;) {
    if (len == capacity) {
      size_t next_capacity = capacity * 2;
      char* next = allocator->realloc(allocator->user, bytes, capacity + 1, next_capacity + 1, _Alignof(char));

      if (next == 0) {
        allocator->free(allocator->user, bytes, capacity + 1, _Alignof(char));
        pclose(pipe);
        return CCJS_ERR_OOM;
      }

      bytes = next;
      capacity = next_capacity;
      bytes[capacity] = 0;
    }

    size_t read = fread(bytes + len, 1, capacity - len, pipe);
    len += read;

    if (read == 0) {
      break;
    }
  }

  int status = pclose(pipe);

  if (status != 0) {
    allocator->free(allocator->user, bytes, capacity + 1, _Alignof(char));
    return CCJS_ERR_UNSUPPORTED;
  }

  ccjs_status result = ccjs_string_from_literal(allocator, bytes, len, out);
  allocator->free(allocator->user, bytes, capacity + 1, _Alignof(char));

  return result;
}

static ccjs_status ccjs_child_process_build_exec_file_command(
  ccjs_allocator* allocator,
  ccjs_value file,
  const ccjs_value* args,
  size_t arg_count,
  char** out,
  size_t* out_len
) {
  const char* file_bytes = 0;
  size_t file_len = 0;
  ccjs_status status = ccjs_child_process_string(file, &file_bytes, &file_len);

  if (status != CCJS_OK) {
    return status;
  }

  size_t total = ccjs_child_process_shell_quoted_len(file_bytes, file_len);

  for (size_t index = 0; index < arg_count; index += 1) {
    const char* arg_bytes = 0;
    size_t arg_len = 0;

    status = ccjs_child_process_string(args[index], &arg_bytes, &arg_len);

    if (status != CCJS_OK) {
      return status;
    }

    total += 1 + ccjs_child_process_shell_quoted_len(arg_bytes, arg_len);
  }

  char* command = ccjs_child_process_alloc(allocator, total);

  if (command == 0) {
    return CCJS_ERR_OOM;
  }

  size_t offset = 0;
  ccjs_child_process_shell_quote(command, &offset, file_bytes, file_len);

  for (size_t index = 0; index < arg_count; index += 1) {
    const char* arg_bytes = 0;
    size_t arg_len = 0;

    status = ccjs_child_process_string(args[index], &arg_bytes, &arg_len);

    if (status != CCJS_OK) {
      allocator->free(allocator->user, command, total + 1, _Alignof(char));
      return status;
    }

    command[offset] = ' ';
    offset += 1;
    ccjs_child_process_shell_quote(command, &offset, arg_bytes, arg_len);
  }

  *out = command;
  *out_len = offset;

  return CCJS_OK;
}

static size_t ccjs_child_process_shell_quoted_len(const char* bytes, size_t len) {
  size_t total = 2;

  for (size_t index = 0; index < len; index += 1) {
    total += bytes[index] == '\'' ? 4 : 1;
  }

  return total;
}

static void ccjs_child_process_shell_quote(char* out, size_t* offset, const char* bytes, size_t len) {
  out[*offset] = '\'';
  *offset += 1;

  for (size_t index = 0; index < len; index += 1) {
    if (bytes[index] == '\'') {
      out[*offset] = '\'';
      out[*offset + 1] = '\\';
      out[*offset + 2] = '\'';
      out[*offset + 3] = '\'';
      *offset += 4;
      continue;
    }

    out[*offset] = bytes[index];
    *offset += 1;
  }

  out[*offset] = '\'';
  *offset += 1;
}

static char* ccjs_child_process_alloc(ccjs_allocator* allocator, size_t len) {
  if (allocator == 0 || allocator->alloc == 0) {
    return 0;
  }

  char* bytes = allocator->alloc(allocator->user, len + 1, _Alignof(char));

  if (bytes != 0) {
    bytes[len] = 0;
  }

  return bytes;
}
