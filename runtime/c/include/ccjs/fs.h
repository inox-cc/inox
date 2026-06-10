#ifndef CCJS_FS_H
#define CCJS_FS_H

#include <stddef.h>
#include "ccjs/loop.h"
#include "ccjs/promise.h"
#include "ccjs/value.h"

typedef ccjs_status (*ccjs_fs_read_file_fn)(
  void* user,
  ccjs_allocator* allocator,
  const char* path,
  size_t path_len,
  ccjs_value* out
);
typedef ccjs_status (*ccjs_fs_write_file_fn)(
  void* user,
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len
);

typedef struct ccjs_fs_adapter {
  void* user;
  ccjs_fs_read_file_fn read_file;
  ccjs_fs_write_file_fn write_file;
} ccjs_fs_adapter;

void ccjs_fs_set_adapter(ccjs_fs_adapter adapter);
ccjs_fs_adapter ccjs_fs_get_adapter(void);
void ccjs_fs_clear_adapter(void);
ccjs_status ccjs_fs_read_file_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
ccjs_status ccjs_fs_write_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len);
ccjs_status ccjs_fs_read_file(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out);
ccjs_status ccjs_fs_write_file(
  ccjs_loop* loop,
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len,
  ccjs_promise** out
);

#endif
