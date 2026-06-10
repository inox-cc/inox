#include <string.h>
#include "ccjs/array.h"
#include "ccjs/fs.h"
#include "ccjs/string.h"

#ifndef CCJS_FS_DISABLE_HOST
#ifndef _WIN32
#include <dirent.h>
#endif
#include <stdio.h>
#include <stdlib.h>
#endif

typedef enum ccjs_fs_request_kind {
  CCJS_FS_REQUEST_READ_FILE,
  CCJS_FS_REQUEST_READ_DIR,
  CCJS_FS_REQUEST_WRITE_FILE
} ccjs_fs_request_kind;

typedef struct ccjs_fs_request {
  ccjs_loop* loop;
  ccjs_promise* promise;
  ccjs_fs_request_kind kind;
  char* path;
  size_t path_len;
  char* bytes;
  size_t byte_len;
} ccjs_fs_request;

static ccjs_fs_adapter ccjs_fs_active_adapter = { 0, 0, 0, 0 };

static ccjs_status ccjs_fs_copy_bytes(ccjs_allocator* allocator, const char* bytes, size_t len, char** out);
#ifndef CCJS_FS_DISABLE_HOST
static ccjs_status ccjs_fs_copy_host_bytes(const char* bytes, size_t len, char** out);
static ccjs_status ccjs_fs_default_read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out);
static ccjs_status ccjs_fs_default_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
#endif
static ccjs_status ccjs_fs_queue_request(
  ccjs_loop* loop,
  ccjs_fs_request_kind kind,
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len,
  ccjs_promise** out
);
static ccjs_status ccjs_fs_run_request(void* context);
static ccjs_status ccjs_fs_reject_status(ccjs_promise* promise, ccjs_status status);
static void ccjs_fs_request_finalizer(void* context);

void ccjs_fs_set_adapter(ccjs_fs_adapter adapter) {
  ccjs_fs_active_adapter = adapter;
}

ccjs_fs_adapter ccjs_fs_get_adapter(void) {
  return ccjs_fs_active_adapter;
}

void ccjs_fs_clear_adapter(void) {
  ccjs_fs_adapter adapter = { 0, 0, 0, 0 };
  ccjs_fs_active_adapter = adapter;
}

ccjs_status ccjs_fs_read_file_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.read_file != 0) {
    return ccjs_fs_active_adapter.read_file(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_read_file(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_read_dir_sync(ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  if (out != 0) {
    *out = ccjs_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.read_dir != 0) {
    return ccjs_fs_active_adapter.read_dir(ccjs_fs_active_adapter.user, allocator, path, path_len, out);
  }

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_read_dir(0, allocator, path, path_len, out);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_write_file_sync(const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  if ((path == 0 && path_len != 0) || (bytes == 0 && byte_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  if (ccjs_fs_active_adapter.write_file != 0) {
    return ccjs_fs_active_adapter.write_file(ccjs_fs_active_adapter.user, path, path_len, bytes, byte_len);
  }

#ifndef CCJS_FS_DISABLE_HOST
  return ccjs_fs_default_write_file(0, path, path_len, bytes, byte_len);
#else
  return CCJS_ERR_UNSUPPORTED;
#endif
}

ccjs_status ccjs_fs_read_file(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READ_FILE, path, path_len, 0, 0, out);
}

ccjs_status ccjs_fs_read_dir(ccjs_loop* loop, const char* path, size_t path_len, ccjs_promise** out) {
  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_READ_DIR, path, path_len, 0, 0, out);
}

ccjs_status ccjs_fs_write_file(
  ccjs_loop* loop,
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len,
  ccjs_promise** out
) {
  return ccjs_fs_queue_request(loop, CCJS_FS_REQUEST_WRITE_FILE, path, path_len, bytes, byte_len, out);
}

static ccjs_status ccjs_fs_copy_bytes(ccjs_allocator* allocator, const char* bytes, size_t len, char** out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (allocator == 0 || allocator->alloc == 0 || len == ((size_t)-1)) {
    return CCJS_ERR_TYPE;
  }

  char* copy = allocator->alloc(allocator->user, len + 1, _Alignof(char));

  if (copy == 0) {
    return CCJS_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  copy[len] = '\0';
  *out = copy;

  return CCJS_OK;
}

#ifndef CCJS_FS_DISABLE_HOST
static ccjs_status ccjs_fs_copy_host_bytes(const char* bytes, size_t len, char** out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (bytes == 0 && len != 0) {
    return CCJS_ERR_TYPE;
  }

  if (len == ((size_t)-1)) {
    return CCJS_ERR_OOM;
  }

  char* copy = malloc(len + 1);

  if (copy == 0) {
    return CCJS_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  copy[len] = '\0';
  *out = copy;

  return CCJS_OK;
}

static ccjs_status ccjs_fs_default_read_file(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  FILE* file = fopen(path_copy, "rb");
  free(path_copy);

  if (file == 0) {
    return CCJS_ERR_FIELD;
  }

  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  long length = ftell(file);

  if (length < 0) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  if (fseek(file, 0, SEEK_SET) != 0) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  size_t byte_len = (size_t)length;
  char* buffer = 0;

  if (byte_len != 0) {
    buffer = malloc(byte_len);

    if (buffer == 0) {
      fclose(file);
      return CCJS_ERR_OOM;
    }

    if (fread(buffer, 1, byte_len, file) != byte_len) {
      free(buffer);
      fclose(file);
      return CCJS_ERR_FIELD;
    }
  }

  fclose(file);
  status = ccjs_string_from_literal(allocator, buffer == 0 ? "" : buffer, byte_len, out);
  free(buffer);

  return status;
}

static ccjs_status ccjs_fs_default_read_dir(void* user, ccjs_allocator* allocator, const char* path, size_t path_len, ccjs_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return CCJS_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  DIR* dir = opendir(path_copy);
  free(path_copy);

  if (dir == 0) {
    return CCJS_ERR_FIELD;
  }

  ccjs_value entries = ccjs_undefined_value();
  status = ccjs_array_new(allocator, 0, &entries);

  if (status != CCJS_OK) {
    closedir(dir);
    return status;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      ccjs_value value = ccjs_undefined_value();
      size_t name_len = strlen(name);
      status = ccjs_string_from_literal(allocator, name, name_len, &value);

      if (status == CCJS_OK) {
        status = ccjs_array_push(entries, value);
      }

      ccjs_release(value);

      if (status != CCJS_OK) {
        closedir(dir);
        ccjs_release(entries);
        return status;
      }
    }

    entry = readdir(dir);
  }

  if (closedir(dir) != 0) {
    ccjs_release(entries);
    return CCJS_ERR_FIELD;
  }

  *out = entries;

  return CCJS_OK;
#endif
}

static ccjs_status ccjs_fs_default_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  char* path_copy = 0;
  ccjs_status status = ccjs_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != CCJS_OK) {
    return status;
  }

  FILE* file = fopen(path_copy, "wb");
  free(path_copy);

  if (file == 0) {
    return CCJS_ERR_FIELD;
  }

  if (byte_len != 0 && fwrite(bytes, 1, byte_len, file) != byte_len) {
    fclose(file);
    return CCJS_ERR_FIELD;
  }

  if (fclose(file) != 0) {
    return CCJS_ERR_FIELD;
  }

  return CCJS_OK;
}
#endif

static ccjs_status ccjs_fs_queue_request(
  ccjs_loop* loop,
  ccjs_fs_request_kind kind,
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len,
  ccjs_promise** out
) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || (path == 0 && path_len != 0) || (bytes == 0 && byte_len != 0)) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise* promise = 0;
  ccjs_status status = ccjs_promise_new(loop, &promise);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_fs_request* request = loop->allocator->alloc(loop->allocator->user, sizeof(ccjs_fs_request), _Alignof(ccjs_fs_request));

  if (request == 0) {
    ccjs_promise_release(promise);
    return CCJS_ERR_OOM;
  }

  request->loop = loop;
  request->promise = promise;
  request->kind = kind;
  request->path = 0;
  request->path_len = path_len;
  request->bytes = 0;
  request->byte_len = byte_len;
  ccjs_promise_retain(promise);

  status = ccjs_fs_copy_bytes(loop->allocator, path, path_len, &request->path);

  if (status == CCJS_OK && kind == CCJS_FS_REQUEST_WRITE_FILE) {
    status = ccjs_fs_copy_bytes(loop->allocator, bytes, byte_len, &request->bytes);
  }

  if (status == CCJS_OK) {
    status = ccjs_loop_queue_immediate(loop, ccjs_fs_run_request, request, ccjs_fs_request_finalizer, 0);
  }

  if (status != CCJS_OK) {
    ccjs_fs_request_finalizer(request);
    ccjs_promise_release(promise);
    return status;
  }

  *out = promise;

  return CCJS_OK;
}

static ccjs_status ccjs_fs_run_request(void* context) {
  ccjs_fs_request* request = (ccjs_fs_request*)context;

  if (request == 0 || request->loop == 0 || request->promise == 0) {
    return CCJS_ERR_TYPE;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_FILE) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = ccjs_fs_read_file_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  if (request->kind == CCJS_FS_REQUEST_READ_DIR) {
    ccjs_value result = ccjs_undefined_value();
    ccjs_status status = ccjs_fs_read_dir_sync(request->loop->allocator, request->path, request->path_len, &result);

    if (status != CCJS_OK) {
      return ccjs_fs_reject_status(request->promise, status);
    }

    ccjs_status resolve_status = ccjs_promise_resolve(request->promise, result);
    ccjs_release(result);

    return resolve_status;
  }

  ccjs_status status = ccjs_fs_write_file_sync(request->path, request->path_len, request->bytes, request->byte_len);

  if (status != CCJS_OK) {
    return ccjs_fs_reject_status(request->promise, status);
  }

  return ccjs_promise_resolve(request->promise, ccjs_undefined_value());
}

static ccjs_status ccjs_fs_reject_status(ccjs_promise* promise, ccjs_status status) {
  ccjs_status reject_status = ccjs_promise_reject(promise, ccjs_number_value((ccjs_number)status));

  return reject_status == CCJS_OK ? CCJS_OK : reject_status;
}

static void ccjs_fs_request_finalizer(void* context) {
  ccjs_fs_request* request = (ccjs_fs_request*)context;

  if (request == 0 || request->loop == 0 || request->loop->allocator == 0 || request->loop->allocator->free == 0) {
    return;
  }

  ccjs_allocator* allocator = request->loop->allocator;

  if (request->path != 0) {
    allocator->free(allocator->user, request->path, request->path_len + 1, _Alignof(char));
  }

  if (request->bytes != 0) {
    allocator->free(allocator->user, request->bytes, request->byte_len + 1, _Alignof(char));
  }

  ccjs_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(ccjs_fs_request), _Alignof(ccjs_fs_request));
}
