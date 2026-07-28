#include <stdint.h>
#include <span>
#include <string.h>
#include <utility>
#include "inox/array.h"
#include "inox/buffer.h"
#include "inox/fs.h"
#include "inox/loop.h"
#include "inox/object.h"
#include "inox/promise_runtime.h"
#include "inox/string.h"

#ifdef INOX_LOOP_BACKEND_LIBUV
#include <limits.h>
#include "loop-libuv-internal.h"
#endif

#if !defined(INOX_FS_DISABLE_HOST) || defined(INOX_LOOP_BACKEND_LIBUV)
#include <stdlib.h>
#include <sys/stat.h>
#endif

#ifndef INOX_FS_DISABLE_HOST
#include <errno.h>
#ifndef _WIN32
#include <dirent.h>
#include <unistd.h>
#else
#include <direct.h>
#include <io.h>
#endif
#include <stdio.h>
#endif

#ifdef F_OK
#undef F_OK
#endif
#ifdef R_OK
#undef R_OK
#endif
#ifdef W_OK
#undef W_OK
#endif
#ifdef X_OK
#undef X_OK
#endif

enum FsRequestKind {
  INOX_FS_REQUEST_READ_FILE,
  INOX_FS_REQUEST_READ_FILE_BYTES,
  INOX_FS_REQUEST_READ_DIR,
  INOX_FS_REQUEST_READ_DIR_DIRENTS,
  INOX_FS_REQUEST_STAT,
  INOX_FS_REQUEST_LSTAT,
  INOX_FS_REQUEST_REALPATH,
  INOX_FS_REQUEST_READLINK,
  INOX_FS_REQUEST_ACCESS,
  INOX_FS_REQUEST_MKDIR,
  INOX_FS_REQUEST_UNLINK,
  INOX_FS_REQUEST_RM,
  INOX_FS_REQUEST_APPEND_FILE,
  INOX_FS_REQUEST_COPY_FILE,
  INOX_FS_REQUEST_SYMLINK,
  INOX_FS_REQUEST_RENAME,
  INOX_FS_REQUEST_WRITE_FILE
};

struct FsRequest {
  inox_loop* loop;
  inox_promise* promise;
  FsRequestKind kind;
  char* path;
  size_t path_len;
  char* path2;
  size_t path2_len;
  char* bytes;
  size_t byte_len;
  int mode;
  bool recursive;
  bool force;
};

static inox_status inox_fs_copy_bytes(inox_allocator* allocator, const char* bytes, size_t len, char** out);
#if !defined(INOX_FS_DISABLE_HOST) || defined(INOX_LOOP_BACKEND_LIBUV)
static inox_status inox_fs_copy_host_bytes(const char* bytes, size_t len, char** out);
#endif
#ifdef INOX_LOOP_BACKEND_LIBUV
static inox_status inox_fs_libuv_read_file(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status
inox_fs_libuv_read_file_bytes(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_libuv_read_dir(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status
inox_fs_libuv_read_dir_dirents(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_libuv_stat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_libuv_lstat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_libuv_realpath(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_libuv_readlink(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_libuv_access(void* user, const char* path, size_t path_len, int mode);
static inox_status inox_fs_libuv_mkdir(void* user, const char* path, size_t path_len, bool recursive);
static inox_status inox_fs_libuv_unlink(void* user, const char* path, size_t path_len);
static inox_status inox_fs_libuv_rm(void* user, const char* path, size_t path_len, bool recursive, bool force);
static inox_status inox_fs_libuv_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
static inox_status inox_fs_libuv_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
static inox_status inox_fs_libuv_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len);
static inox_status
inox_fs_libuv_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
static inox_status inox_fs_libuv_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
static inox_status inox_fs_libuv_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len);
static inox_status inox_fs_libuv_queue_request(
  inox_loop* loop,
  FsRequestKind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  inox_promise** out
);
#endif
#ifndef INOX_FS_DISABLE_HOST
static inox_status inox_fs_default_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len);
static inox_status
inox_fs_default_read_file(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status
inox_fs_default_read_file_bytes(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status
inox_fs_default_read_dir(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status
inox_fs_default_read_dir_dirents(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_default_stat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_default_lstat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_default_realpath(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_default_readlink(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);
static inox_status inox_fs_default_access(void* user, const char* path, size_t path_len, int mode);
static inox_status inox_fs_default_mkdir(void* user, const char* path, size_t path_len, bool recursive);
static inox_status inox_fs_default_unlink(void* user, const char* path, size_t path_len);
static inox_status inox_fs_default_rm(void* user, const char* path, size_t path_len, bool recursive, bool force);
static inox_status inox_fs_default_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
static inox_status inox_fs_default_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
);
static inox_status inox_fs_default_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len);
static inox_status
inox_fs_default_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len);
static inox_status inox_fs_default_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len);
#endif
static inox_status inox_fs_queue_request(
  inox_loop* loop,
  FsRequestKind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  inox_promise** out
);
static inox_status inox_fs_run_request(void* context);
static inox_status inox_fs_reject_status(inox_loop* loop, inox_promise* promise, inox_status status);
static inox_status inox_fs_reject_request_status(FsRequest* request, inox_status status);
static inox_status inox_fs_error_from_status(inox_allocator* allocator, inox_status status, inox_value* out);
static void inox_fs_throw_status(inox_status status);
static void inox_fs_throw_status_if_needed(inox_status status);
static inox_status inox_fs_reject_thrown(inox_promise* promise);
static const char* inox_fs_error_code(inox_status status);
static const char* inox_fs_error_message(inox_status status);
static void inox_fs_request_finalizer(void* context);
static bool inox_fs_throw_sync_status(inox_status status, inox_value* value);

enum {
  INOX_FS_STATS_SIZE_INDEX = 0,
  INOX_FS_STATS_MODE_INDEX = 1,
  INOX_FS_STATS_MTIME_MS_INDEX = 2,
  INOX_FS_STATS_IS_FILE_INDEX = 3,
  INOX_FS_STATS_IS_DIRECTORY_INDEX = 4
};

static inox_status
inox_fs_stats_new(inox_allocator* allocator, double size, double mode, double mtime_ms, bool is_file, bool is_directory, inox_value* out) {
  static const inox_field_info fields[] = { { "size", INOX_FIELD_READONLY },
                                            { "mode", INOX_FIELD_READONLY },
                                            { "mtimeMs", INOX_FIELD_READONLY },
                                            { "__inoxIsFile", INOX_FIELD_READONLY },
                                            { "__inoxIsDirectory", INOX_FIELD_READONLY } };
  static const inox_shape shape = { 5, fields };

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value stats = inox_undefined_value();
  inox_status status = inox_object_new(allocator, &shape, &stats);

  if (status == INOX_OK) {
    status = inox_object_init_known(stats, INOX_FS_STATS_SIZE_INDEX, inox_number_value(size));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(stats, INOX_FS_STATS_MODE_INDEX, inox_number_value(mode));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(stats, INOX_FS_STATS_MTIME_MS_INDEX, inox_number_value(mtime_ms));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(stats, INOX_FS_STATS_IS_FILE_INDEX, inox_bool_value(is_file));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(stats, INOX_FS_STATS_IS_DIRECTORY_INDEX, inox_bool_value(is_directory));
  }

  if (status != INOX_OK) {
    inox_release(stats);
    return status;
  }

  *out = stats;

  return INOX_OK;
}

FsStats::FsStats() : inox::Value() {}

FsStats::FsStats(const inox::Value& value) : inox::Value(value) {}

FsStats::FsStats(inox::Value&& value) : inox::Value(std::move(value)) {}

static inox::Value inox_fs_read_facade_field(
  const inox::Value& object,
  uint32_t field_index,
  const char* invariant_message
) {
  inox::Value field;

  if (inox_object_get_known(object, field_index, field.out()) != INOX_OK) {
    inox::fatal(invariant_message);
  }

  return field;
}

static double inox_fs_read_number_field(
  const inox::Value& object,
  uint32_t field_index,
  const char* invariant_message
) {
  inox::Value field = inox_fs_read_facade_field(object, field_index, invariant_message);

  if (field.tag != INOX_TAG_NUMBER) {
    inox::fatal(invariant_message);
  }

  return field.as.number;
}

bool FsStats::valid() const {
  inox_value value = raw();

  return (value.tag == INOX_TAG_OBJECT || value.tag == INOX_TAG_CLASS_INSTANCE) && value.as.ref != 0;
}

double FsStats::size() const {
  return inox_fs_read_number_field(*this, INOX_FS_STATS_SIZE_INDEX, "FsStats.size native facade invariant failed");
}

double FsStats::mode() const {
  return inox_fs_read_number_field(*this, INOX_FS_STATS_MODE_INDEX, "FsStats.mode native facade invariant failed");
}

double FsStats::mtimeMs() const {
  return inox_fs_read_number_field(
    *this,
    INOX_FS_STATS_MTIME_MS_INDEX,
    "FsStats.mtimeMs native facade invariant failed"
  );
}

bool FsStats::isFile() const {
  inox_value value = inox_undefined_value();

  if (inox_object_get_known(raw(), INOX_FS_STATS_IS_FILE_INDEX, &value) != INOX_OK) {
    inox::fatal("FsStats.isFile native facade invariant failed");
  }

  if (value.tag != INOX_TAG_BOOL) {
    inox_release(value);
    inox::fatal("FsStats.isFile native facade invariant failed");
  }

  const bool result = value.as.boolean;
  inox_release(value);

  return result;
}

bool FsStats::isDirectory() const {
  inox_value value = inox_undefined_value();

  if (inox_object_get_known(raw(), INOX_FS_STATS_IS_DIRECTORY_INDEX, &value) != INOX_OK) {
    inox::fatal("FsStats.isDirectory native facade invariant failed");
  }

  if (value.tag != INOX_TAG_BOOL) {
    inox_release(value);
    inox::fatal("FsStats.isDirectory native facade invariant failed");
  }

  const bool result = value.as.boolean;
  inox_release(value);

  return result;
}

enum {
  INOX_FS_DIRENT_NAME_INDEX = 0,
  INOX_FS_DIRENT_IS_FILE_INDEX = 1,
  INOX_FS_DIRENT_IS_DIRECTORY_INDEX = 2
};

static inox_status inox_fs_dirent_new(
  inox_allocator* allocator,
  const char* name,
  size_t name_len,
  bool is_file,
  bool is_directory,
  inox_value* out
) {
  static const inox_field_info fields[] = { { "name", INOX_FIELD_READONLY },
                                            { "__inoxIsFile", INOX_FIELD_READONLY },
                                            { "__inoxIsDirectory", INOX_FIELD_READONLY } };
  static const inox_shape shape = { 3, fields };

  if (allocator == 0 || out == 0 || (name == 0 && name_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  inox_value dirent = inox_undefined_value();
  inox::String name_value;
  inox_status status = inox_object_new(allocator, &shape, &dirent);

  if (status == INOX_OK) {
    name_value = inox::String(name == 0 ? "" : name, name_len);
    status = name_value.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(dirent, INOX_FS_DIRENT_NAME_INDEX, name_value);
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(dirent, INOX_FS_DIRENT_IS_FILE_INDEX, inox_bool_value(is_file));
  }

  if (status == INOX_OK) {
    status = inox_object_init_known(dirent, INOX_FS_DIRENT_IS_DIRECTORY_INDEX, inox_bool_value(is_directory));
  }

  if (status != INOX_OK) {
    inox_release(dirent);
    return status;
  }

  *out = dirent;

  return INOX_OK;
}

FsDirent::FsDirent() : inox::Value() {}

FsDirent::FsDirent(const inox::Value& value) : inox::Value(value) {}

FsDirent::FsDirent(inox::Value&& value) : inox::Value(std::move(value)) {}

inox::String FsDirent::name() const {
  inox::Value field = inox_fs_read_facade_field(
    *this,
    INOX_FS_DIRENT_NAME_INDEX,
    "FsDirent.name native facade invariant failed"
  );

  if (field.tag != INOX_TAG_STRING || field.as.ref == 0) {
    inox::fatal("FsDirent.name native facade invariant failed");
  }

  return inox::String(std::move(field));
}

bool FsDirent::isFile() const {
  inox_value value = inox_undefined_value();

  if (inox_object_get_known(raw(), INOX_FS_DIRENT_IS_FILE_INDEX, &value) != INOX_OK) {
    inox::fatal("FsDirent.isFile native facade invariant failed");
  }

  if (value.tag != INOX_TAG_BOOL) {
    inox_release(value);
    inox::fatal("FsDirent.isFile native facade invariant failed");
  }

  const bool result = value.as.boolean;
  inox_release(value);

  return result;
}

bool FsDirent::isDirectory() const {
  inox_value value = inox_undefined_value();

  if (inox_object_get_known(raw(), INOX_FS_DIRENT_IS_DIRECTORY_INDEX, &value) != INOX_OK) {
    inox::fatal("FsDirent.isDirectory native facade invariant failed");
  }

  if (value.tag != INOX_TAG_BOOL) {
    inox_release(value);
    inox::fatal("FsDirent.isDirectory native facade invariant failed");
  }

  const bool result = value.as.boolean;
  inox_release(value);

  return result;
}

class fs fs;

FsConstants::FsConstants() : F_OK(0), R_OK(4), W_OK(2), X_OK(1) {}

static bool inox_fs_throw_sync_status(inox_status status, inox_value* value) {
  if (status == INOX_OK) {
    return false;
  }

  if (value != 0) {
    inox_release(*value);
    *value = inox_undefined_value();
  }

  inox_fs_throw_status_if_needed(status);
  return true;
}

static inox_status fs_read_file_bytes_sync_status(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out);

inox::String fs::readFileSync(inox::StringView path, inox::StringView encoding) {
  (void)encoding;
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_file(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_file(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return inox::String();
  }

  return inox::String(inox::adopt(out));
}

static inox_status fs_read_file_bytes_sync_status(inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  if (out != 0) {
    *out = inox_undefined_value();
  }

  if (allocator == 0 || allocator->alloc == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

#ifdef INOX_LOOP_BACKEND_LIBUV
  return inox_fs_libuv_read_file_bytes(0, allocator, path, path_len, out);
#endif

#ifndef INOX_FS_DISABLE_HOST
  return inox_fs_default_read_file_bytes(0, allocator, path, path_len, out);
#else
  return INOX_ERR_UNSUPPORTED;
#endif
}

Buffer fs::readFileSync(inox::StringView path) {
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (inox_default_allocator.alloc == 0 || (path.bytes == 0 && path.len != 0)) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_file_bytes(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_file_bytes(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return Buffer();
  }

  return Buffer(inox::adopt(out));
}

Array fs::readdirSync(inox::StringView path) {
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_dir(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_dir(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return Array();
  }

  return Array(inox::adopt(out));
}

Array fs::readdirSync(inox::StringView path, inox::StringView encoding) {
  (void)encoding;
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_dir(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_dir(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return Array();
  }

  return Array(inox::adopt(out));
}

Array fs::readdirSync(inox::StringView path, FsReadDirOptions options) {
  (void)options;
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_dir_dirents(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_dir_dirents(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return Array();
  }

  return Array(inox::adopt(out));
}

FsStats fs::statSync(inox::StringView path) {
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_stat(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_stat(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return FsStats();
  }

  return FsStats(inox::adopt(out));
}

FsStats fs::lstatSync(inox::StringView path) {
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_lstat(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_lstat(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return FsStats();
  }

  return FsStats(inox::adopt(out));
}

inox::String fs::realpathSync(inox::StringView path) {
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_realpath(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_realpath(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return inox::String();
  }

  return inox::String(inox::adopt(out));
}

inox::String fs::readlinkSync(inox::StringView path) {
  inox_value out = inox_undefined_value();
  inox_status status = INOX_ERR_UNSUPPORTED;

  if (path.bytes == 0 && path.len != 0) {
    status = INOX_ERR_TYPE;
  } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_readlink(0, &inox_default_allocator, path.bytes, path.len, &out);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_readlink(0, &inox_default_allocator, path.bytes, path.len, &out);
#endif
  }

  if (inox_fs_throw_sync_status(status, &out)) {
    return inox::String();
  }

  return inox::String(inox::adopt(out));
}

void fs::accessSync(inox::StringView path) {
  accessSync(path, 0);
}

void fs::accessSync(inox::StringView path, int mode) {
  if (path.bytes == 0 && path.len != 0) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_access(0, path.bytes, path.len, mode);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_access(0, path.bytes, path.len, mode);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::mkdirSync(inox::StringView path, bool recursive) {
  if (path.bytes == 0 && path.len != 0) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_mkdir(0, path.bytes, path.len, recursive);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_mkdir(0, path.bytes, path.len, recursive);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::unlinkSync(inox::StringView path) {
  if (path.bytes == 0 && path.len != 0) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_unlink(0, path.bytes, path.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_unlink(0, path.bytes, path.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::rmSync(inox::StringView path, bool recursive, bool force) {
  if (path.bytes == 0 && path.len != 0) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_rm(0, path.bytes, path.len, recursive, force);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_rm(0, path.bytes, path.len, recursive, force);
#endif

  if (status != INOX_OK && !(status == INOX_ERR_UNSUPPORTED && force)) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::appendFileSync(inox::StringView path, inox::StringView bytes) {
  if ((path.bytes == 0 && path.len != 0) || (bytes.bytes == 0 && bytes.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_append_file(0, path.bytes, path.len, bytes.bytes, bytes.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_append_file(0, path.bytes, path.len, bytes.bytes, bytes.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::appendFileSync(inox::StringView path, Uint8Array bytes) {
  const auto data = bytes.bytes();

  if (inox::thrown() || (path.bytes == 0 && path.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox::StringView bytes_view(reinterpret_cast<const char*>(data.data()), data.size());

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_append_file(0, path.bytes, path.len, bytes_view.bytes, bytes_view.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_append_file(0, path.bytes, path.len, bytes_view.bytes, bytes_view.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::copyFileSync(inox::StringView src_path, inox::StringView dest_path) {
  if ((src_path.bytes == 0 && src_path.len != 0) || (dest_path.bytes == 0 && dest_path.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_copy_file(0, src_path.bytes, src_path.len, dest_path.bytes, dest_path.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_copy_file(0, src_path.bytes, src_path.len, dest_path.bytes, dest_path.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::symlinkSync(inox::StringView target, inox::StringView path) {
  if ((target.bytes == 0 && target.len != 0) || (path.bytes == 0 && path.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_symlink(0, target.bytes, target.len, path.bytes, path.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_symlink(0, target.bytes, target.len, path.bytes, path.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::renameSync(inox::StringView old_path, inox::StringView new_path) {
  if ((old_path.bytes == 0 && old_path.len != 0) || (new_path.bytes == 0 && new_path.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_rename(0, old_path.bytes, old_path.len, new_path.bytes, new_path.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_rename(0, old_path.bytes, old_path.len, new_path.bytes, new_path.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::writeFileSync(inox::StringView path, inox::StringView bytes) {
  if ((path.bytes == 0 && path.len != 0) || (bytes.bytes == 0 && bytes.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_write_file(0, path.bytes, path.len, bytes.bytes, bytes.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_write_file(0, path.bytes, path.len, bytes.bytes, bytes.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

void fs::writeFileSync(inox::StringView path, Uint8Array bytes) {
  const auto data = bytes.bytes();

  if (inox::thrown() || (path.bytes == 0 && path.len != 0)) {
    inox_fs_throw_status_if_needed(INOX_ERR_TYPE);
    return;
  }

  inox::StringView bytes_view(reinterpret_cast<const char*>(data.data()), data.size());

  inox_status status = INOX_ERR_UNSUPPORTED;
#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_write_file(0, path.bytes, path.len, bytes_view.bytes, bytes_view.len);
#elif !defined(INOX_FS_DISABLE_HOST)
  status = inox_fs_default_write_file(0, path.bytes, path.len, bytes_view.bytes, bytes_view.len);
#endif

  if (status != INOX_OK) {
    inox_fs_throw_status_if_needed(status);
  }
}

inox::Promise fs_promises::readFile(inox::StringView path, inox::StringView encoding) {
  (void)encoding;
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_READ_FILE, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_READ_FILE, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::readFile(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_READ_FILE_BYTES, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_READ_FILE_BYTES, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::readdir(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_READ_DIR, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_READ_DIR, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::readdir(inox::StringView path, inox::StringView encoding) {
  (void)encoding;
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_READ_DIR, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_READ_DIR, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::readdir(inox::StringView path, FsReadDirOptions options) {
  (void)options;
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_READ_DIR_DIRENTS, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_READ_DIR_DIRENTS, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::stat(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(inox::loop(), INOX_FS_REQUEST_STAT, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_STAT, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::lstat(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(inox::loop(), INOX_FS_REQUEST_LSTAT, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_LSTAT, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::realpath(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_REALPATH, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_REALPATH, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::readlink(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_READLINK, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_READLINK, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::access(inox::StringView path) {
  return access(path, 0);
}

inox::Promise fs_promises::access(inox::StringView path, int mode) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_ACCESS, path.bytes, path.len, 0, 0, 0, 0, mode, false, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_ACCESS, path.bytes, path.len, 0, 0, 0, 0, mode, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::mkdir(inox::StringView path, bool recursive) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_MKDIR, path.bytes, path.len, 0, 0, 0, 0, 0, recursive, false, &promise
  );
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_MKDIR, path.bytes, path.len, 0, 0, 0, 0, 0, recursive, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::rm(inox::StringView path, bool recursive, bool force) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(inox::loop(), INOX_FS_REQUEST_RM, path.bytes, path.len, 0, 0, 0, 0, 0, recursive, force, &promise);
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_RM, path.bytes, path.len, 0, 0, 0, 0, 0, recursive, force, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::writeFile(inox::StringView path, inox::StringView bytes) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_WRITE_FILE, path.bytes, path.len, 0, 0, bytes.bytes, bytes.len, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_WRITE_FILE, path.bytes, path.len, 0, 0, bytes.bytes, bytes.len, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::writeFile(inox::StringView path, Uint8Array bytes) {
  const auto data = bytes.bytes();

  if (inox::thrown()) {
    return inox::Promise();
  }

  const char* bytes_data = reinterpret_cast<const char*>(data.data());
  const size_t byte_len = data.size();
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_WRITE_FILE, path.bytes, path.len, 0, 0, bytes_data, byte_len, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_WRITE_FILE, path.bytes, path.len, 0, 0, bytes_data, byte_len, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::appendFile(inox::StringView path, inox::StringView bytes) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_APPEND_FILE, path.bytes, path.len, 0, 0, bytes.bytes, bytes.len, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_APPEND_FILE, path.bytes, path.len, 0, 0, bytes.bytes, bytes.len, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::appendFile(inox::StringView path, Uint8Array bytes) {
  const auto data = bytes.bytes();

  if (inox::thrown()) {
    return inox::Promise();
  }

  const char* bytes_data = reinterpret_cast<const char*>(data.data());
  const size_t byte_len = data.size();
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_APPEND_FILE, path.bytes, path.len, 0, 0, bytes_data, byte_len, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_APPEND_FILE, path.bytes, path.len, 0, 0, bytes_data, byte_len, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::copyFile(inox::StringView src_path, inox::StringView dest_path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_COPY_FILE, src_path.bytes, src_path.len, dest_path.bytes, dest_path.len, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_COPY_FILE, src_path.bytes, src_path.len, dest_path.bytes, dest_path.len, 0, 0, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::symlink(inox::StringView target, inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_SYMLINK, target.bytes, target.len, path.bytes, path.len, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_SYMLINK, target.bytes, target.len, path.bytes, path.len, 0, 0, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::rename(inox::StringView old_path, inox::StringView new_path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(
    inox::loop(), INOX_FS_REQUEST_RENAME, old_path.bytes, old_path.len, new_path.bytes, new_path.len, 0, 0, 0, false, false, &promise
  );
#else
    status = inox_fs_queue_request(
      inox::loop(), INOX_FS_REQUEST_RENAME, old_path.bytes, old_path.len, new_path.bytes, new_path.len, 0, 0, 0, false, false, &promise
    );
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

inox::Promise fs_promises::unlink(inox::StringView path) {
  inox_promise* promise = 0;
  inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
  status = inox_fs_libuv_queue_request(inox::loop(), INOX_FS_REQUEST_UNLINK, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#else
    status = inox_fs_queue_request(inox::loop(), INOX_FS_REQUEST_UNLINK, path.bytes, path.len, 0, 0, 0, 0, 0, false, false, &promise);
#endif

  return status == INOX_OK ? inox::detail::PromiseRuntimeBridge::adopt(promise) : inox::Promise();
}

static inox_status inox_fs_copy_bytes(inox_allocator* allocator, const char* bytes, size_t len, char** out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (bytes == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

  if (allocator == 0 || allocator->alloc == 0 || len == ((size_t)-1)) {
    return INOX_ERR_TYPE;
  }

  char* copy = (char*)allocator->alloc(allocator->user, len + 1, alignof(char));

  if (copy == 0) {
    return INOX_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  copy[len] = '\0';
  *out = copy;

  return INOX_OK;
}

#if !defined(INOX_FS_DISABLE_HOST) || defined(INOX_LOOP_BACKEND_LIBUV)
static inox_status inox_fs_copy_host_bytes(const char* bytes, size_t len, char** out) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (bytes == 0 && len != 0) {
    return INOX_ERR_TYPE;
  }

  if (len == ((size_t)-1)) {
    return INOX_ERR_OOM;
  }

  char* copy = (char*)malloc(len + 1);

  if (copy == 0) {
    return INOX_ERR_OOM;
  }

  if (len != 0) {
    memcpy(copy, bytes, len);
  }

  copy[len] = '\0';
  *out = copy;

  return INOX_OK;
}
#endif

#ifdef INOX_LOOP_BACKEND_LIBUV
enum FsLibuvStage {
  INOX_FS_LIBUV_STAGE_OPEN,
  INOX_FS_LIBUV_STAGE_FSTAT,
  INOX_FS_LIBUV_STAGE_READ,
  INOX_FS_LIBUV_STAGE_WRITE,
  INOX_FS_LIBUV_STAGE_CLOSE,
  INOX_FS_LIBUV_STAGE_SCANDIR,
  INOX_FS_LIBUV_STAGE_STAT,
  INOX_FS_LIBUV_STAGE_LSTAT,
  INOX_FS_LIBUV_STAGE_REALPATH,
  INOX_FS_LIBUV_STAGE_READLINK,
  INOX_FS_LIBUV_STAGE_ACCESS,
  INOX_FS_LIBUV_STAGE_MKDIR,
  INOX_FS_LIBUV_STAGE_UNLINK,
  INOX_FS_LIBUV_STAGE_RM,
  INOX_FS_LIBUV_STAGE_COPY_FILE,
  INOX_FS_LIBUV_STAGE_SYMLINK,
  INOX_FS_LIBUV_STAGE_RENAME
};

struct FsLibuvRequest {
  inox_loop* loop;
  inox_promise* promise;
  FsRequestKind kind;
  FsLibuvStage stage;
  uv_fs_t req;
  uv_file file;
  int file_open;
  char* path;
  size_t path_len;
  char* path2;
  size_t path2_len;
  char* bytes;
  size_t byte_len;
  size_t byte_offset;
  int mode;
  bool recursive;
  bool force;
  char* data;
  size_t data_len;
  size_t data_cap;
  inox_status close_status;
};

static inox_status inox_fs_status_from_uv(ssize_t result);
static inox_status inox_fs_libuv_close_sync(uv_file file, inox_status status);
static inox_status inox_fs_stats_from_uv(inox_allocator* allocator, const uv_stat_t* stat, inox_value* out);
static double inox_fs_uv_mtime_ms(const uv_stat_t* stat);
static inox_status inox_fs_libuv_read_dir_entries(uv_fs_t* req, inox_allocator* allocator, bool with_file_types, inox_value* out);
static inox_status inox_fs_libuv_start_request(FsLibuvRequest* request);
static inox_status inox_fs_libuv_start_open(FsLibuvRequest* request, int flags, int mode);
static inox_status inox_fs_libuv_start_fstat(FsLibuvRequest* request);
static inox_status inox_fs_libuv_start_read(FsLibuvRequest* request);
static inox_status inox_fs_libuv_start_write(FsLibuvRequest* request);
static inox_status inox_fs_libuv_start_close(FsLibuvRequest* request, inox_status close_status);
static inox_status inox_fs_libuv_settle(FsLibuvRequest* request, inox_status status);
static inox_status inox_fs_libuv_settle_value(FsLibuvRequest* request, inox_status status, inox_value value);
static inox_status inox_fs_libuv_settle_after_close(FsLibuvRequest* request, inox_status status);
static void inox_fs_libuv_cb(uv_fs_t* req);
static void inox_fs_libuv_request_finalizer(FsLibuvRequest* request);

static inox_status inox_fs_status_from_uv(ssize_t result) {
  if (result >= 0) {
    return INOX_OK;
  }

  if (result == UV_ENOMEM) {
    return INOX_ERR_OOM;
  }

  if (result == UV_EINVAL) {
    return INOX_ERR_TYPE;
  }

  if (result == UV_EACCES || result == UV_EPERM || result == UV_EROFS) {
    return INOX_ERR_READONLY;
  }

  return INOX_ERR_FIELD;
}

static inox_status inox_fs_libuv_close_sync(uv_file file, inox_status status) {
  uv_fs_t close_req;
  int close_result = uv_fs_close(0, &close_req, file, 0);
  uv_fs_req_cleanup(&close_req);

  if (status != INOX_OK) {
    return status;
  }

  return inox_fs_status_from_uv(close_result);
}

static double inox_fs_uv_mtime_ms(const uv_stat_t* stat) {
  if (stat == 0) {
    return 0;
  }

  return ((double)stat->st_mtim.tv_sec * 1000.0) + ((double)stat->st_mtim.tv_nsec / 1000000.0);
}

static inox_status inox_fs_stats_from_uv(inox_allocator* allocator, const uv_stat_t* stat, inox_value* out) {
  if (stat == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_fs_stats_new(
    allocator,
    (double)stat->st_size,
    (double)stat->st_mode,
    inox_fs_uv_mtime_ms(stat),
    S_ISREG(stat->st_mode),
    S_ISDIR(stat->st_mode),
    out
  );
}

static inox_status inox_fs_libuv_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len) {
  if (out_bytes == 0 || out_len == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out_bytes = 0;
  *out_len = 0;

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t open_req;
  int open_result = uv_fs_open(0, &open_req, path_copy, UV_FS_O_RDONLY, 0, 0);
  uv_fs_req_cleanup(&open_req);
  free(path_copy);

  if (open_result < 0) {
    return inox_fs_status_from_uv(open_result);
  }

  uv_file file = (uv_file)open_result;
  uv_fs_t stat_req;
  int stat_result = uv_fs_fstat(0, &stat_req, file, 0);

  if (stat_result < 0) {
    uv_fs_req_cleanup(&stat_req);
    return inox_fs_libuv_close_sync(file, inox_fs_status_from_uv(stat_result));
  }

  uint64_t file_size = uv_fs_get_statbuf(&stat_req)->st_size;
  uv_fs_req_cleanup(&stat_req);

  if (file_size > (uint64_t)INT64_MAX || file_size > (uint64_t)(SIZE_MAX - 1)) {
    return inox_fs_libuv_close_sync(file, INOX_ERR_OOM);
  }

  size_t byte_len = (size_t)file_size;
  char* buffer = 0;

  if (byte_len != 0) {
    buffer = (char*)malloc(byte_len + 1);

    if (buffer == 0) {
      return inox_fs_libuv_close_sync(file, INOX_ERR_OOM);
    }
  }

  size_t offset = 0;

  while (offset < byte_len) {
    size_t remaining = byte_len - offset;
    unsigned int chunk_len = remaining > (size_t)UINT_MAX ? UINT_MAX : (unsigned int)remaining;
    uv_buf_t buffer_slice = uv_buf_init(buffer + offset, chunk_len);
    uv_fs_t read_req;
    int read_result = uv_fs_read(0, &read_req, file, &buffer_slice, 1, (int64_t)offset, 0);
    uv_fs_req_cleanup(&read_req);

    if (read_result < 0) {
      free(buffer);
      return inox_fs_libuv_close_sync(file, inox_fs_status_from_uv(read_result));
    }

    if (read_result == 0) {
      break;
    }

    offset += (size_t)read_result;
  }

  if (buffer != 0) {
    buffer[offset] = '\0';
  }

  status = inox_fs_libuv_close_sync(file, INOX_OK);

  if (status != INOX_OK) {
    free(buffer);
    return status;
  }

  *out_bytes = buffer;
  *out_len = offset;

  return INOX_OK;
}

static inox_status
inox_fs_libuv_read_file(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  inox_status status = inox_fs_libuv_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == INOX_OK) {
    auto value = inox::String(buffer == 0 ? "" : buffer, byte_len);
    status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  }

  free(buffer);

  return status;
}

static inox_status
inox_fs_libuv_read_file_bytes(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  inox_status status = inox_fs_libuv_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == INOX_OK) {
    Buffer bytes(std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(buffer), byte_len));

    if (inox::thrown()) {
      inox::take_exception();
      status = INOX_ERR_TYPE;
    } else {
      status = bytes.valid() ? bytes.copy_to(out) : INOX_ERR_TYPE;
    }
  }

  free(buffer);

  return status;
}

static inox_status inox_fs_libuv_read_dir_entries(uv_fs_t* req, inox_allocator* allocator, bool with_file_types, inox_value* out) {
  if (req == 0 || allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  Array entries = Array::create(0);

  if (inox::thrown()) {
    return INOX_ERR_TYPE;
  }

  uv_dirent_t entry;
  int next_result = uv_fs_scandir_next(req, &entry);

  while (next_result != UV_EOF) {
    if (next_result < 0) {
      return inox_fs_status_from_uv(next_result);
    }

    inox_value value = inox_undefined_value();
    size_t name_len = strlen(entry.name);
    inox_status status = INOX_OK;

    if (with_file_types) {
      status = inox_fs_dirent_new(
        allocator,
        entry.name,
        name_len,
        entry.type == UV_DIRENT_FILE,
        entry.type == UV_DIRENT_DIR,
        &value
      );
    } else {
      auto name_value = inox::String(entry.name, name_len);
      status = name_value.valid() ? name_value.copy_to(&value) : INOX_ERR_OOM;
    }

    if (status != INOX_OK) {
      inox_release(value);
      return status;
    }

    entries.push(value);
    inox_release(value);

    if (inox::thrown()) {
      return INOX_ERR_TYPE;
    }

    next_result = uv_fs_scandir_next(req, &entry);
  }

  *out = entries.release();

  return INOX_OK;
}

static inox_status inox_fs_libuv_read_dir(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t scan_req;
  int scan_result = uv_fs_scandir(0, &scan_req, path_copy, 0, 0);
  free(path_copy);

  if (scan_result < 0) {
    uv_fs_req_cleanup(&scan_req);
    return inox_fs_status_from_uv(scan_result);
  }

  status = inox_fs_libuv_read_dir_entries(&scan_req, allocator, false, out);
  uv_fs_req_cleanup(&scan_req);

  return status;
}

static inox_status inox_fs_libuv_read_dir_dirents(
  void* user,
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out
) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t scan_req;
  int scan_result = uv_fs_scandir(0, &scan_req, path_copy, 0, 0);
  free(path_copy);

  if (scan_result < 0) {
    uv_fs_req_cleanup(&scan_req);
    return inox_fs_status_from_uv(scan_result);
  }

  status = inox_fs_libuv_read_dir_entries(&scan_req, allocator, true, out);
  uv_fs_req_cleanup(&scan_req);

  return status;
}

static inox_status inox_fs_libuv_stat_like(
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out,
  bool follow_symlink
) {
  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t stat_req;
  int stat_result = follow_symlink ? uv_fs_stat(0, &stat_req, path_copy, 0) : uv_fs_lstat(0, &stat_req, path_copy, 0);
  free(path_copy);

  if (stat_result < 0) {
    uv_fs_req_cleanup(&stat_req);
    return inox_fs_status_from_uv(stat_result);
  }

  status = inox_fs_stats_from_uv(allocator, uv_fs_get_statbuf(&stat_req), out);
  uv_fs_req_cleanup(&stat_req);

  return status;
}

static inox_status inox_fs_libuv_stat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  return inox_fs_libuv_stat_like(allocator, path, path_len, out, true);
}

static inox_status inox_fs_libuv_lstat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  return inox_fs_libuv_stat_like(allocator, path, path_len, out, false);
}

static inox_status inox_fs_libuv_string_path_result(
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out,
  bool realpath_result
) {
  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t req;
  int result = realpath_result ? uv_fs_realpath(0, &req, path_copy, 0) : uv_fs_readlink(0, &req, path_copy, 0);
  free(path_copy);

  if (result < 0) {
    uv_fs_req_cleanup(&req);
    return inox_fs_status_from_uv(result);
  }

  const char* text = (const char*)req.ptr;
  {
    auto value = inox::String(text == 0 ? "" : text, text == 0 ? 0 : strlen(text));
    status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  }
  uv_fs_req_cleanup(&req);

  return status;
}

static inox_status inox_fs_libuv_realpath(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  return inox_fs_libuv_string_path_result(allocator, path, path_len, out, true);
}

static inox_status inox_fs_libuv_readlink(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  return inox_fs_libuv_string_path_result(allocator, path, path_len, out, false);
}

static inox_status inox_fs_libuv_access(void* user, const char* path, size_t path_len, int mode) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t access_req;
  int access_result = uv_fs_access(0, &access_req, path_copy, mode, 0);
  free(path_copy);
  uv_fs_req_cleanup(&access_req);

  return inox_fs_status_from_uv(access_result);
}

static inox_status inox_fs_libuv_mkdir_one(const char* path) {
  uv_fs_t req;
  int result = uv_fs_mkdir(0, &req, path, 0777, 0);
  uv_fs_req_cleanup(&req);

  return result == 0 || result == UV_EEXIST ? INOX_OK : inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_mkdir_recursive(char* path) {
  if (path == 0 || path[0] == '\0') {
    return INOX_ERR_TYPE;
  }

  for (char* cursor = path + 1; *cursor != '\0'; cursor += 1) {
    if (*cursor != '/' && *cursor != '\\') {
      continue;
    }

    char saved = *cursor;
    *cursor = '\0';

    if (path[0] != '\0') {
      inox_status status = inox_fs_libuv_mkdir_one(path);

      if (status != INOX_OK) {
        *cursor = saved;
        return status;
      }
    }

    *cursor = saved;
  }

  return inox_fs_libuv_mkdir_one(path);
}

static inox_status inox_fs_libuv_mkdir(void* user, const char* path, size_t path_len, bool recursive) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  status = recursive ? inox_fs_libuv_mkdir_recursive(path_copy) : inox_fs_libuv_mkdir_one(path_copy);
  free(path_copy);

  return status;
}

static inox_status inox_fs_libuv_unlink(void* user, const char* path, size_t path_len) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_unlink(0, &req, path_copy, 0);
  uv_fs_req_cleanup(&req);
  free(path_copy);

  return inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_rm_path(char* path, bool recursive, bool force) {
  uv_fs_t unlink_req;
  int unlink_result = uv_fs_unlink(0, &unlink_req, path, 0);
  uv_fs_req_cleanup(&unlink_req);

  if (unlink_result == 0) {
    return INOX_OK;
  }

  if (unlink_result == UV_ENOENT && force) {
    return INOX_OK;
  }

  if (!recursive) {
    return inox_fs_status_from_uv(unlink_result);
  }

  uv_fs_t scan_req;
  int scan_result = uv_fs_scandir(0, &scan_req, path, 0, 0);

  if (scan_result < 0) {
    uv_fs_req_cleanup(&scan_req);
    return scan_result == UV_ENOENT && force ? INOX_OK : inox_fs_status_from_uv(scan_result);
  }

  uv_dirent_t entry;
  int next_result = uv_fs_scandir_next(&scan_req, &entry);

  while (next_result != UV_EOF) {
    if (next_result < 0) {
      uv_fs_req_cleanup(&scan_req);
      return inox_fs_status_from_uv(next_result);
    }

    size_t path_len = strlen(path);
    size_t name_len = strlen(entry.name);
    char* child = (char*)malloc(path_len + 1 + name_len + 1);

    if (child == 0) {
      uv_fs_req_cleanup(&scan_req);
      return INOX_ERR_OOM;
    }

    memcpy(child, path, path_len);
    child[path_len] = '/';
    memcpy(child + path_len + 1, entry.name, name_len + 1);
    inox_status child_status =
      entry.type == UV_DIRENT_DIR ? inox_fs_libuv_rm_path(child, true, force) : inox_fs_libuv_rm_path(child, false, force);
    free(child);

    if (child_status != INOX_OK) {
      uv_fs_req_cleanup(&scan_req);
      return child_status;
    }

    next_result = uv_fs_scandir_next(&scan_req, &entry);
  }

  uv_fs_req_cleanup(&scan_req);

  uv_fs_t rmdir_req;
  int rmdir_result = uv_fs_rmdir(0, &rmdir_req, path, 0);
  uv_fs_req_cleanup(&rmdir_req);

  return rmdir_result == 0 || (rmdir_result == UV_ENOENT && force) ? INOX_OK : inox_fs_status_from_uv(rmdir_result);
}

static inox_status inox_fs_libuv_rm(void* user, const char* path, size_t path_len, bool recursive, bool force) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  status = inox_fs_libuv_rm_path(path_copy, recursive, force);
  free(path_copy);

  return status;
}

static inox_status
inox_fs_libuv_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len) {
  (void)user;

  if ((old_path == 0 && old_path_len != 0) || (new_path == 0 && new_path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  char* old_copy = 0;
  char* new_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(old_path, old_path_len, &old_copy);

  if (status == INOX_OK) {
    status = inox_fs_copy_host_bytes(new_path, new_path_len, &new_copy);
  }

  if (status != INOX_OK) {
    free(old_copy);
    free(new_copy);
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_rename(0, &req, old_copy, new_copy, 0);
  uv_fs_req_cleanup(&req);
  free(old_copy);
  free(new_copy);

  return inox_fs_status_from_uv(result);
}

static inox_status
inox_fs_libuv_write_file_with_flags(const char* path, size_t path_len, const char* bytes, size_t byte_len, int flags) {
  if ((path == 0 && path_len != 0) || (bytes == 0 && byte_len != 0)) {
    return INOX_ERR_TYPE;
  }

  if (byte_len > (size_t)INT64_MAX) {
    return INOX_ERR_OOM;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  uv_fs_t open_req;
  int open_result = uv_fs_open(0, &open_req, path_copy, flags, 0666, 0);
  uv_fs_req_cleanup(&open_req);
  free(path_copy);

  if (open_result < 0) {
    return inox_fs_status_from_uv(open_result);
  }

  uv_file file = (uv_file)open_result;
  size_t offset = 0;

  while (offset < byte_len) {
    size_t remaining = byte_len - offset;
    unsigned int chunk_len = remaining > (size_t)UINT_MAX ? UINT_MAX : (unsigned int)remaining;
    uv_buf_t buffer_slice = uv_buf_init((char*)bytes + offset, chunk_len);
    uv_fs_t write_req;
    int64_t write_offset = (flags & UV_FS_O_APPEND) != 0 ? -1 : (int64_t)offset;
    int write_result = uv_fs_write(0, &write_req, file, &buffer_slice, 1, write_offset, 0);
    uv_fs_req_cleanup(&write_req);

    if (write_result < 0) {
      return inox_fs_libuv_close_sync(file, inox_fs_status_from_uv(write_result));
    }

    if (write_result == 0) {
      return inox_fs_libuv_close_sync(file, INOX_ERR_FIELD);
    }

    offset += (size_t)write_result;
  }

  return inox_fs_libuv_close_sync(file, INOX_OK);
}

static inox_status inox_fs_libuv_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return inox_fs_libuv_write_file_with_flags(path, path_len, bytes, byte_len, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_APPEND);
}

static inox_status inox_fs_libuv_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
) {
  (void)user;

  if ((src_path == 0 && src_path_len != 0) || (dest_path == 0 && dest_path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  char* src_copy = 0;
  char* dest_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(src_path, src_path_len, &src_copy);

  if (status == INOX_OK) {
    status = inox_fs_copy_host_bytes(dest_path, dest_path_len, &dest_copy);
  }

  if (status != INOX_OK) {
    free(src_copy);
    free(dest_copy);
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_copyfile(0, &req, src_copy, dest_copy, 0, 0);
  uv_fs_req_cleanup(&req);
  free(src_copy);
  free(dest_copy);

  return inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len) {
  (void)user;

  if ((target == 0 && target_len != 0) || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  char* target_copy = 0;
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(target, target_len, &target_copy);

  if (status == INOX_OK) {
    status = inox_fs_copy_host_bytes(path, path_len, &path_copy);
  }

  if (status != INOX_OK) {
    free(target_copy);
    free(path_copy);
    return status;
  }

  uv_fs_t req;
  int result = uv_fs_symlink(0, &req, target_copy, path_copy, 0, 0);
  uv_fs_req_cleanup(&req);
  free(target_copy);
  free(path_copy);

  return inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return inox_fs_libuv_write_file_with_flags(path, path_len, bytes, byte_len, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_TRUNC);
}

static inox_status inox_fs_libuv_queue_request(
  inox_loop* loop,
  FsRequestKind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  inox_promise** out
) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (
    loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || (path == 0 && path_len != 0) ||
    (path2 == 0 && path2_len != 0) ||
    (bytes == 0 && byte_len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  inox_promise* promise = 0;
  inox_status status = inox_promise_new(loop, &promise);

  if (status != INOX_OK) {
    return status;
  }

  FsLibuvRequest* request =
    (FsLibuvRequest*)loop->allocator->alloc(loop->allocator->user, sizeof(FsLibuvRequest), alignof(FsLibuvRequest));

  if (request == 0) {
    inox_promise_release(promise);
    return INOX_ERR_OOM;
  }

  memset(request, 0, sizeof(FsLibuvRequest));
  request->loop = loop;
  request->promise = promise;
  request->kind = kind;
  request->stage = INOX_FS_LIBUV_STAGE_OPEN;
  request->file = 0;
  request->path_len = path_len;
  request->path2_len = path2_len;
  request->byte_len = byte_len;
  request->mode = mode;
  request->recursive = recursive;
  request->force = force;
  request->close_status = INOX_OK;
  inox_promise_retain(promise);

  status = inox_fs_copy_bytes(loop->allocator, path, path_len, &request->path);

  if (status == INOX_OK && (kind == INOX_FS_REQUEST_COPY_FILE || kind == INOX_FS_REQUEST_RENAME || kind == INOX_FS_REQUEST_SYMLINK)) {
    status = inox_fs_copy_bytes(loop->allocator, path2, path2_len, &request->path2);
  }

  if (status == INOX_OK && (kind == INOX_FS_REQUEST_APPEND_FILE || kind == INOX_FS_REQUEST_WRITE_FILE)) {
    status = inox_fs_copy_bytes(loop->allocator, bytes, byte_len, &request->bytes);
  }

  if (status == INOX_OK) {
    status = inox_libuv_loop_retain_request(loop);
  }

  if (status == INOX_OK) {
    status = inox_fs_libuv_start_request(request);
  }

  if (status != INOX_OK) {
    if (inox_libuv_loop_handle(loop) != 0) {
      inox_libuv_loop_release_request(loop);
    }
    inox_fs_libuv_request_finalizer(request);
    inox_promise_release(promise);
    return status;
  }

  *out = promise;

  return INOX_OK;
}

static inox_status inox_fs_libuv_start_request(FsLibuvRequest* request) {
  if (request == 0) {
    return INOX_ERR_TYPE;
  }

  if (request->kind == INOX_FS_REQUEST_READ_DIR || request->kind == INOX_FS_REQUEST_READ_DIR_DIRENTS) {
    request->stage = INOX_FS_LIBUV_STAGE_SCANDIR;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_scandir(uv_loop, &request->req, request->path, 0, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_STAT || request->kind == INOX_FS_REQUEST_LSTAT) {
    request->stage = request->kind == INOX_FS_REQUEST_STAT ? INOX_FS_LIBUV_STAGE_STAT : INOX_FS_LIBUV_STAGE_LSTAT;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = request->kind == INOX_FS_REQUEST_STAT
                   ? uv_fs_stat(uv_loop, &request->req, request->path, inox_fs_libuv_cb)
                   : uv_fs_lstat(uv_loop, &request->req, request->path, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_REALPATH || request->kind == INOX_FS_REQUEST_READLINK) {
    request->stage = request->kind == INOX_FS_REQUEST_REALPATH ? INOX_FS_LIBUV_STAGE_REALPATH : INOX_FS_LIBUV_STAGE_READLINK;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = request->kind == INOX_FS_REQUEST_REALPATH
                   ? uv_fs_realpath(uv_loop, &request->req, request->path, inox_fs_libuv_cb)
                   : uv_fs_readlink(uv_loop, &request->req, request->path, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_ACCESS) {
    request->stage = INOX_FS_LIBUV_STAGE_ACCESS;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_access(uv_loop, &request->req, request->path, request->mode, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_MKDIR) {
    request->stage = INOX_FS_LIBUV_STAGE_MKDIR;

    if (request->recursive) {
      inox_status status = inox_fs_libuv_mkdir(0, request->path, request->path_len, true);

      return inox_fs_libuv_settle_value(request, status, inox_undefined_value());
    }

    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_mkdir(uv_loop, &request->req, request->path, 0777, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_UNLINK) {
    request->stage = INOX_FS_LIBUV_STAGE_UNLINK;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_unlink(uv_loop, &request->req, request->path, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_RM) {
    request->stage = INOX_FS_LIBUV_STAGE_RM;

    if (request->recursive) {
      inox_status status = inox_fs_libuv_rm(0, request->path, request->path_len, true, request->force);

      return inox_fs_libuv_settle_value(request, status, inox_undefined_value());
    }

    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_unlink(uv_loop, &request->req, request->path, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_RENAME) {
    request->stage = INOX_FS_LIBUV_STAGE_RENAME;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_rename(uv_loop, &request->req, request->path, request->path2, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_COPY_FILE) {
    request->stage = INOX_FS_LIBUV_STAGE_COPY_FILE;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_copyfile(uv_loop, &request->req, request->path, request->path2, 0, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_SYMLINK) {
    request->stage = INOX_FS_LIBUV_STAGE_SYMLINK;
    request->req.data = request;
    uv_loop_t* uv_loop = inox_libuv_loop_handle(request->loop);

    if (uv_loop == 0) {
      return INOX_ERR_TYPE;
    }

    int result = uv_fs_symlink(uv_loop, &request->req, request->path, request->path2, 0, inox_fs_libuv_cb);

    return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
  }

  if (request->kind == INOX_FS_REQUEST_APPEND_FILE) {
    return inox_fs_libuv_start_open(request, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_APPEND, 0666);
  }

  if (request->kind == INOX_FS_REQUEST_WRITE_FILE) {
    return inox_fs_libuv_start_open(request, UV_FS_O_WRONLY | UV_FS_O_CREAT | UV_FS_O_TRUNC, 0666);
  }

  return inox_fs_libuv_start_open(request, UV_FS_O_RDONLY, 0);
}

static inox_status inox_fs_libuv_start_open(FsLibuvRequest* request, int flags, int mode) {
  uv_loop_t* uv_loop = inox_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0) {
    return INOX_ERR_TYPE;
  }

  request->stage = INOX_FS_LIBUV_STAGE_OPEN;
  request->req.data = request;
  int result = uv_fs_open(uv_loop, &request->req, request->path, flags, mode, inox_fs_libuv_cb);

  return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_start_fstat(FsLibuvRequest* request) {
  uv_loop_t* uv_loop = inox_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0) {
    return INOX_ERR_TYPE;
  }

  request->stage = INOX_FS_LIBUV_STAGE_FSTAT;
  request->req.data = request;
  int result = uv_fs_fstat(uv_loop, &request->req, request->file, inox_fs_libuv_cb);

  return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_start_read(FsLibuvRequest* request) {
  uv_loop_t* uv_loop = inox_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0 || request->data == 0 || request->data_cap == 0) {
    return INOX_ERR_TYPE;
  }

  if (request->data_cap > (size_t)UINT_MAX) {
    return INOX_ERR_OOM;
  }

  uv_buf_t buffer = uv_buf_init(request->data, (unsigned int)request->data_cap);
  request->stage = INOX_FS_LIBUV_STAGE_READ;
  request->req.data = request;
  int result = uv_fs_read(uv_loop, &request->req, request->file, &buffer, 1, 0, inox_fs_libuv_cb);

  return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_start_write(FsLibuvRequest* request) {
  uv_loop_t* uv_loop = inox_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0 || (request->bytes == 0 && request->byte_len != 0)) {
    return INOX_ERR_TYPE;
  }

  size_t remaining = request->byte_len - request->byte_offset;

  if (remaining == 0) {
    return inox_fs_libuv_start_close(request, INOX_OK);
  }

  unsigned int chunk_len = remaining > (size_t)UINT_MAX ? UINT_MAX : (unsigned int)remaining;
  uv_buf_t buffer = uv_buf_init(request->bytes + request->byte_offset, chunk_len);
  request->stage = INOX_FS_LIBUV_STAGE_WRITE;
  request->req.data = request;
  int64_t offset = request->kind == INOX_FS_REQUEST_APPEND_FILE ? -1 : (int64_t)request->byte_offset;
  int result = uv_fs_write(uv_loop, &request->req, request->file, &buffer, 1, offset, inox_fs_libuv_cb);

  return result == 0 ? INOX_OK : inox_fs_status_from_uv(result);
}

static inox_status inox_fs_libuv_start_close(FsLibuvRequest* request, inox_status close_status) {
  uv_loop_t* uv_loop = inox_libuv_loop_handle(request == 0 ? 0 : request->loop);

  if (request == 0 || uv_loop == 0) {
    return INOX_ERR_TYPE;
  }

  request->close_status = close_status;

  if (!request->file_open) {
    return inox_fs_libuv_settle(request, close_status);
  }

  request->stage = INOX_FS_LIBUV_STAGE_CLOSE;
  request->req.data = request;
  int result = uv_fs_close(uv_loop, &request->req, request->file, inox_fs_libuv_cb);

  if (result != 0) {
    request->file_open = 0;
    return inox_fs_libuv_settle(request, close_status == INOX_OK ? inox_fs_status_from_uv(result) : close_status);
  }

  return INOX_OK;
}

static inox_status inox_fs_libuv_settle(FsLibuvRequest* request, inox_status status) {
  if (request == 0) {
    return INOX_ERR_TYPE;
  }

  if (status != INOX_OK) {
    return inox_fs_libuv_settle_value(request, status, inox_undefined_value());
  }

  inox_value result = inox_undefined_value();

  if (request->kind == INOX_FS_REQUEST_READ_FILE) {
    auto value = inox::String(request->data == 0 ? "" : request->data, request->data_len);
    status = value.valid() ? value.copy_to(&result) : INOX_ERR_OOM;
  } else if (request->kind == INOX_FS_REQUEST_READ_FILE_BYTES) {
    Uint8Array bytes(
      std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(request->data), request->data_len)
    );

    if (inox::thrown()) {
      inox::take_exception();
      status = INOX_ERR_TYPE;
    } else {
      status = bytes.valid() ? bytes.copy_to(&result) : INOX_ERR_TYPE;
    }
  }

  return inox_fs_libuv_settle_value(request, status, result);
}

static inox_status inox_fs_libuv_settle_value(FsLibuvRequest* request, inox_status status, inox_value value) {
  if (request == 0 || request->loop == 0 || request->promise == 0) {
    inox_release(value);
    return INOX_ERR_TYPE;
  }

  inox_status settle_status =
    status == INOX_OK ? inox_promise_resolve(request->promise, value) : inox_fs_reject_status(request->loop, request->promise, status);

  inox_release(value);
  inox_libuv_loop_release_request(request->loop);
  inox_fs_libuv_request_finalizer(request);

  return settle_status;
}

static inox_status inox_fs_libuv_settle_after_close(FsLibuvRequest* request, inox_status status) {
  if (request == 0) {
    return INOX_ERR_TYPE;
  }

  request->file_open = 0;

  if (request->close_status != INOX_OK) {
    status = request->close_status;
  }

  return inox_fs_libuv_settle(request, status);
}

static void inox_fs_libuv_cb(uv_fs_t* req) {
  if (req == 0 || req->data == 0) {
    return;
  }

  FsLibuvRequest* request = (FsLibuvRequest*)req->data;
  inox_loop* loop = request->loop;
  ssize_t result = uv_fs_get_result(req);
  inox_status status = inox_fs_status_from_uv(result);

  if (request->stage == INOX_FS_LIBUV_STAGE_SCANDIR) {
    inox_value entries = inox_undefined_value();

    if (status == INOX_OK) {
      status = inox_fs_libuv_read_dir_entries(
        req, request->loop->allocator, request->kind == INOX_FS_REQUEST_READ_DIR_DIRENTS, &entries
      );
    }

    uv_fs_req_cleanup(req);
    status = inox_fs_libuv_settle_value(request, status, entries);

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_STAT || request->stage == INOX_FS_LIBUV_STAGE_LSTAT) {
    inox_value stats = inox_undefined_value();

    if (status == INOX_OK) {
      status = inox_fs_stats_from_uv(request->loop->allocator, uv_fs_get_statbuf(req), &stats);
    }

    uv_fs_req_cleanup(req);
    status = inox_fs_libuv_settle_value(request, status, stats);

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_REALPATH || request->stage == INOX_FS_LIBUV_STAGE_READLINK) {
    inox_value text = inox_undefined_value();

    if (status == INOX_OK) {
      const char* result_text = (const char*)req->ptr;
      auto value = inox::String(result_text == 0 ? "" : result_text, result_text == 0 ? 0 : strlen(result_text));
      status = value.valid() ? value.copy_to(&text) : INOX_ERR_OOM;
    }

    uv_fs_req_cleanup(req);
    status = inox_fs_libuv_settle_value(request, status, text);

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_ACCESS) {
    uv_fs_req_cleanup(req);
    status = inox_fs_libuv_settle_value(request, status, inox_undefined_value());

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (
    request->stage == INOX_FS_LIBUV_STAGE_MKDIR || request->stage == INOX_FS_LIBUV_STAGE_UNLINK ||
    request->stage == INOX_FS_LIBUV_STAGE_RM || request->stage == INOX_FS_LIBUV_STAGE_COPY_FILE ||
    request->stage == INOX_FS_LIBUV_STAGE_SYMLINK || request->stage == INOX_FS_LIBUV_STAGE_RENAME
  ) {
    uv_fs_req_cleanup(req);

    if (request->stage == INOX_FS_LIBUV_STAGE_RM && result == UV_ENOENT && request->force) {
      status = INOX_OK;
    }

    status = inox_fs_libuv_settle_value(request, status, inox_undefined_value());

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_OPEN) {
    if (status != INOX_OK) {
      uv_fs_req_cleanup(req);
      status = inox_fs_libuv_settle(request, status);
    } else {
      request->file = (uv_file)result;
      request->file_open = 1;
      uv_fs_req_cleanup(req);
      status = request->kind == INOX_FS_REQUEST_WRITE_FILE || request->kind == INOX_FS_REQUEST_APPEND_FILE
                 ? inox_fs_libuv_start_write(request)
                 : inox_fs_libuv_start_fstat(request);

      if (status != INOX_OK) {
        status = inox_fs_libuv_start_close(request, status);
      }
    }

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_FSTAT) {
    if (status == INOX_OK) {
      uint64_t file_size = uv_fs_get_statbuf(req)->st_size;

      if (file_size > (uint64_t)INT64_MAX || file_size > (uint64_t)(SIZE_MAX - 1) || file_size > (uint64_t)UINT_MAX) {
        status = INOX_ERR_OOM;
      } else {
        request->data_cap = (size_t)file_size;

        if (request->data_cap != 0) {
          request->data =
            (char*)request->loop->allocator->alloc(request->loop->allocator->user, request->data_cap + 1, alignof(char));

          if (request->data == 0) {
            status = INOX_ERR_OOM;
          }
        }
      }
    }

    uv_fs_req_cleanup(req);

    if (status == INOX_OK && request->data_cap != 0) {
      status = inox_fs_libuv_start_read(request);

      if (status != INOX_OK) {
        status = inox_fs_libuv_start_close(request, status);
      }
    } else {
      status = inox_fs_libuv_start_close(request, status);
    }

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_READ) {
    if (status == INOX_OK) {
      request->data_len = (size_t)result;

      if (request->data != 0) {
        request->data[request->data_len] = '\0';
      }
    }

    uv_fs_req_cleanup(req);
    status = inox_fs_libuv_start_close(request, status);

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  if (request->stage == INOX_FS_LIBUV_STAGE_WRITE) {
    if (status == INOX_OK) {
      if (result == 0 && request->byte_offset < request->byte_len) {
        status = INOX_ERR_FIELD;
      } else {
        request->byte_offset += (size_t)result;
      }
    }

    uv_fs_req_cleanup(req);

    if (status == INOX_OK && request->byte_offset < request->byte_len) {
      status = inox_fs_libuv_start_write(request);

      if (status != INOX_OK) {
        status = inox_fs_libuv_start_close(request, status);
      }
    } else {
      status = inox_fs_libuv_start_close(request, status);
    }

    if (status != INOX_OK) {
      inox_libuv_loop_report_status(loop, status);
    }

    return;
  }

  uv_fs_req_cleanup(req);
  status = inox_fs_libuv_settle_after_close(request, status);

  if (status != INOX_OK) {
    inox_libuv_loop_report_status(loop, status);
  }
}

static void inox_fs_libuv_request_finalizer(FsLibuvRequest* request) {
  if (request == 0 || request->loop == 0 || request->loop->allocator == 0 || request->loop->allocator->free == 0) {
    return;
  }

  inox_allocator* allocator = request->loop->allocator;

  if (request->path != 0) {
    allocator->free(allocator->user, request->path, request->path_len + 1, alignof(char));
  }

  if (request->path2 != 0) {
    allocator->free(allocator->user, request->path2, request->path2_len + 1, alignof(char));
  }

  if (request->bytes != 0) {
    allocator->free(allocator->user, request->bytes, request->byte_len + 1, alignof(char));
  }

  if (request->data != 0) {
    allocator->free(allocator->user, request->data, request->data_cap + 1, alignof(char));
  }

  inox_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(FsLibuvRequest), alignof(FsLibuvRequest));
}
#endif

#ifndef INOX_FS_DISABLE_HOST
static inox_status inox_fs_default_read_file_data(const char* path, size_t path_len, char** out_bytes, size_t* out_len) {
  if (out_bytes == 0 || out_len == 0) {
    return INOX_ERR_TYPE;
  }

  *out_bytes = 0;
  *out_len = 0;

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  FILE* file = fopen(path_copy, "rb");
  free(path_copy);

  if (file == 0) {
    return INOX_ERR_FIELD;
  }

  if (fseek(file, 0, SEEK_END) != 0) {
    fclose(file);
    return INOX_ERR_FIELD;
  }

  long length = ftell(file);

  if (length < 0) {
    fclose(file);
    return INOX_ERR_FIELD;
  }

  if (fseek(file, 0, SEEK_SET) != 0) {
    fclose(file);
    return INOX_ERR_FIELD;
  }

  size_t byte_len = (size_t)length;
  char* buffer = 0;

  if (byte_len != 0) {
    buffer = (char*)malloc(byte_len);

    if (buffer == 0) {
      fclose(file);
      return INOX_ERR_OOM;
    }

    if (fread(buffer, 1, byte_len, file) != byte_len) {
      free(buffer);
      fclose(file);
      return INOX_ERR_FIELD;
    }
  }

  fclose(file);
  *out_bytes = buffer;
  *out_len = byte_len;

  return INOX_OK;
}

static inox_status
inox_fs_default_read_file(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  inox_status status = inox_fs_default_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == INOX_OK) {
    auto value = inox::String(buffer == 0 ? "" : buffer, byte_len);
    status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  }

  free(buffer);

  return status;
}

static inox_status
inox_fs_default_read_file_bytes(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  char* buffer = 0;
  size_t byte_len = 0;
  inox_status status = inox_fs_default_read_file_data(path, path_len, &buffer, &byte_len);

  if (status == INOX_OK) {
    Buffer bytes(std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(buffer), byte_len));

    if (inox::thrown()) {
      inox::take_exception();
      status = INOX_ERR_TYPE;
    } else {
      status = bytes.valid() ? bytes.copy_to(out) : INOX_ERR_TYPE;
    }
  }

  free(buffer);

  return status;
}

static inox_status
inox_fs_default_read_dir(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return INOX_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  DIR* dir = opendir(path_copy);
  free(path_copy);

  if (dir == 0) {
    return INOX_ERR_FIELD;
  }

  Array entries = Array::create(0);

  if (inox::thrown()) {
    closedir(dir);
    return INOX_ERR_TYPE;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      inox_value value = inox_undefined_value();
      size_t name_len = strlen(name);
      auto name_value = inox::String(name, name_len);
      status = name_value.valid() ? name_value.copy_to(&value) : INOX_ERR_OOM;

      if (status != INOX_OK) {
        closedir(dir);
        inox_release(value);
        return status;
      }

      entries.push(value);
      inox_release(value);

      if (inox::thrown()) {
        closedir(dir);
        return INOX_ERR_TYPE;
      }
    }

    entry = readdir(dir);
  }

  if (closedir(dir) != 0) {
    return INOX_ERR_FIELD;
  }

  *out = entries.release();

  return INOX_OK;
#endif
}

static inox_status inox_fs_default_dirent_type(const char* dir_path, const char* name, bool* is_file, bool* is_directory) {
  if (dir_path == 0 || name == 0 || is_file == 0 || is_directory == 0) {
    return INOX_ERR_TYPE;
  }

  *is_file = false;
  *is_directory = false;

  size_t dir_len = strlen(dir_path);
  size_t name_len = strlen(name);
  char* child = (char*)malloc(dir_len + 1 + name_len + 1);

  if (child == 0) {
    return INOX_ERR_OOM;
  }

  memcpy(child, dir_path, dir_len);
  child[dir_len] = '/';
  memcpy(child + dir_len + 1, name, name_len + 1);

  struct stat statbuf;
  int stat_result = stat(child, &statbuf);
  free(child);

  if (stat_result != 0) {
    return INOX_ERR_FIELD;
  }

  *is_file = S_ISREG(statbuf.st_mode);
  *is_directory = S_ISDIR(statbuf.st_mode);

  return INOX_OK;
}

static inox_status
inox_fs_default_read_dir_dirents(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return INOX_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  DIR* dir = opendir(path_copy);

  if (dir == 0) {
    free(path_copy);
    return INOX_ERR_FIELD;
  }

  Array entries = Array::create(0);

  if (inox::thrown()) {
    free(path_copy);
    closedir(dir);
    return INOX_ERR_TYPE;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      bool is_file = false;
      bool is_directory = false;
      status = inox_fs_default_dirent_type(path_copy, name, &is_file, &is_directory);

      inox_value value = inox_undefined_value();
      size_t name_len = strlen(name);

      if (status == INOX_OK) {
        status = inox_fs_dirent_new(allocator, name, name_len, is_file, is_directory, &value);
      }

      if (status != INOX_OK) {
        free(path_copy);
        closedir(dir);
        inox_release(value);
        return status;
      }

      entries.push(value);
      inox_release(value);

      if (inox::thrown()) {
        free(path_copy);
        closedir(dir);
        return INOX_ERR_TYPE;
      }
    }

    entry = readdir(dir);
  }

  free(path_copy);

  if (closedir(dir) != 0) {
    return INOX_ERR_FIELD;
  }

  *out = entries.release();

  return INOX_OK;
#endif
}

static double inox_fs_default_mtime_ms(const struct stat* stat) {
  if (stat == 0) {
    return 0;
  }

#ifdef _WIN32
  return (double)stat->st_mtime * 1000.0;
#elif defined(__APPLE__) || defined(__MACH__) || defined(__FreeBSD__) || defined(__OpenBSD__) || defined(__NetBSD__)
  return ((double)stat->st_mtimespec.tv_sec * 1000.0) + ((double)stat->st_mtimespec.tv_nsec / 1000000.0);
#else
  return ((double)stat->st_mtim.tv_sec * 1000.0) + ((double)stat->st_mtim.tv_nsec / 1000000.0);
#endif
}

static inox_status inox_fs_default_stats_from_stat(inox_allocator* allocator, const struct stat* stat, inox_value* out) {
  if (stat == 0) {
    return INOX_ERR_TYPE;
  }

  return inox_fs_stats_new(
    allocator,
    (double)stat->st_size,
    (double)stat->st_mode,
    inox_fs_default_mtime_ms(stat),
    S_ISREG(stat->st_mode),
    S_ISDIR(stat->st_mode),
    out
  );
}

static inox_status inox_fs_default_stat_like(
  inox_allocator* allocator,
  const char* path,
  size_t path_len,
  inox_value* out,
  bool follow_symlink
) {
  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  struct stat statbuf;
#ifdef _WIN32
  (void)follow_symlink;
  int stat_result = stat(path_copy, &statbuf);
#else
  int stat_result = follow_symlink ? stat(path_copy, &statbuf) : lstat(path_copy, &statbuf);
#endif
  free(path_copy);

  if (stat_result != 0) {
    return INOX_ERR_FIELD;
  }

  return inox_fs_default_stats_from_stat(allocator, &statbuf, out);
}

static inox_status inox_fs_default_stat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  return inox_fs_default_stat_like(allocator, path, path_len, out, true);
}

static inox_status inox_fs_default_lstat(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  return inox_fs_default_stat_like(allocator, path, path_len, out, false);
}

static inox_status inox_fs_default_realpath(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return INOX_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  char* resolved = realpath(path_copy, 0);
  free(path_copy);

  if (resolved == 0) {
    return INOX_ERR_FIELD;
  }

  {
    auto value = inox::String(resolved, strlen(resolved));
    status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
  }
  free(resolved);

  return status;
#endif
}

static inox_status inox_fs_default_readlink(void* user, inox_allocator* allocator, const char* path, size_t path_len, inox_value* out) {
  (void)user;

  if (allocator == 0 || out == 0 || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

#ifdef _WIN32
  (void)path;
  (void)path_len;
  return INOX_ERR_UNSUPPORTED;
#else
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  size_t cap = 256;
  char* buffer = 0;

  for (;;) {
    char* next = (char*)realloc(buffer, cap + 1);

    if (next == 0) {
      free(buffer);
      free(path_copy);
      return INOX_ERR_OOM;
    }

    buffer = next;
    ssize_t len = readlink(path_copy, buffer, cap);

    if (len < 0) {
      free(buffer);
      free(path_copy);
      return INOX_ERR_FIELD;
    }

    if ((size_t)len < cap) {
      buffer[len] = '\0';
      auto value = inox::String(buffer, (size_t)len);
      status = value.valid() ? value.copy_to(out) : INOX_ERR_OOM;
      free(buffer);
      free(path_copy);
      return status;
    }

    cap *= 2;
  }
#endif
}

static inox_status inox_fs_default_access(void* user, const char* path, size_t path_len, int mode) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

#ifdef _WIN32
  int access_result = _access(path_copy, mode);
#else
  int access_result = access(path_copy, mode);
#endif
  free(path_copy);

  return access_result == 0 ? INOX_OK : INOX_ERR_FIELD;
}

static inox_status inox_fs_default_mkdir_one(const char* path) {
#ifdef _WIN32
  int result = _mkdir(path);
#else
  int result = mkdir(path, 0777);
#endif

  return result == 0 || errno == EEXIST ? INOX_OK : INOX_ERR_FIELD;
}

static inox_status inox_fs_default_mkdir_recursive(char* path) {
  if (path == 0 || path[0] == '\0') {
    return INOX_ERR_TYPE;
  }

  for (char* cursor = path + 1; *cursor != '\0'; cursor += 1) {
    if (*cursor != '/' && *cursor != '\\') {
      continue;
    }

    char saved = *cursor;
    *cursor = '\0';

    if (path[0] != '\0') {
      inox_status status = inox_fs_default_mkdir_one(path);

      if (status != INOX_OK) {
        *cursor = saved;
        return status;
      }
    }

    *cursor = saved;
  }

  return inox_fs_default_mkdir_one(path);
}

static inox_status inox_fs_default_mkdir(void* user, const char* path, size_t path_len, bool recursive) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  errno = 0;
  status = recursive ? inox_fs_default_mkdir_recursive(path_copy) : inox_fs_default_mkdir_one(path_copy);
  free(path_copy);

  return status;
}

static inox_status inox_fs_default_unlink(void* user, const char* path, size_t path_len) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

#ifdef _WIN32
  int result = _unlink(path_copy);
#else
  int result = unlink(path_copy);
#endif
  free(path_copy);

  return result == 0 ? INOX_OK : INOX_ERR_FIELD;
}

static inox_status inox_fs_default_rm_path(char* path, bool recursive, bool force) {
#ifdef _WIN32
  int unlink_result = _unlink(path);
#else
  int unlink_result = unlink(path);
#endif

  if (unlink_result == 0) {
    return INOX_OK;
  }

  if (errno == ENOENT && force) {
    return INOX_OK;
  }

  if (!recursive) {
    return INOX_ERR_FIELD;
  }

#ifdef _WIN32
  return INOX_ERR_UNSUPPORTED;
#else
  DIR* dir = opendir(path);

  if (dir == 0) {
    return errno == ENOENT && force ? INOX_OK : INOX_ERR_FIELD;
  }

  struct dirent* entry = readdir(dir);

  while (entry != 0) {
    const char* name = entry->d_name;

    if (strcmp(name, ".") != 0 && strcmp(name, "..") != 0) {
      size_t path_len = strlen(path);
      size_t name_len = strlen(name);
      char* child = (char*)malloc(path_len + 1 + name_len + 1);

      if (child == 0) {
        closedir(dir);
        return INOX_ERR_OOM;
      }

      memcpy(child, path, path_len);
      child[path_len] = '/';
      memcpy(child + path_len + 1, name, name_len + 1);
      inox_status status = inox_fs_default_rm_path(child, true, force);
      free(child);

      if (status != INOX_OK) {
        closedir(dir);
        return status;
      }
    }

    entry = readdir(dir);
  }

  if (closedir(dir) != 0) {
    return INOX_ERR_FIELD;
  }

  return rmdir(path) == 0 || (errno == ENOENT && force) ? INOX_OK : INOX_ERR_FIELD;
#endif
}

static inox_status inox_fs_default_rm(void* user, const char* path, size_t path_len, bool recursive, bool force) {
  (void)user;

  if (path == 0 && path_len != 0) {
    return INOX_ERR_TYPE;
  }

  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  errno = 0;
  status = inox_fs_default_rm_path(path_copy, recursive, force);
  free(path_copy);

  return status;
}

static inox_status
inox_fs_default_rename(void* user, const char* old_path, size_t old_path_len, const char* new_path, size_t new_path_len) {
  (void)user;

  if ((old_path == 0 && old_path_len != 0) || (new_path == 0 && new_path_len != 0)) {
    return INOX_ERR_TYPE;
  }

  char* old_copy = 0;
  char* new_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(old_path, old_path_len, &old_copy);

  if (status == INOX_OK) {
    status = inox_fs_copy_host_bytes(new_path, new_path_len, &new_copy);
  }

  if (status != INOX_OK) {
    free(old_copy);
    free(new_copy);
    return status;
  }

  int result = rename(old_copy, new_copy);
  free(old_copy);
  free(new_copy);

  return result == 0 ? INOX_OK : INOX_ERR_FIELD;
}

static inox_status inox_fs_default_write_file_with_mode(
  const char* path,
  size_t path_len,
  const char* bytes,
  size_t byte_len,
  const char* mode
) {
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(path, path_len, &path_copy);

  if (status != INOX_OK) {
    return status;
  }

  FILE* file = fopen(path_copy, mode);
  free(path_copy);

  if (file == 0) {
    return INOX_ERR_FIELD;
  }

  if (byte_len != 0 && fwrite(bytes, 1, byte_len, file) != byte_len) {
    fclose(file);
    return INOX_ERR_FIELD;
  }

  if (fclose(file) != 0) {
    return INOX_ERR_FIELD;
  }

  return INOX_OK;
}

static inox_status inox_fs_default_append_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return inox_fs_default_write_file_with_mode(path, path_len, bytes, byte_len, "ab");
}

static inox_status inox_fs_default_copy_file(
  void* user,
  const char* src_path,
  size_t src_path_len,
  const char* dest_path,
  size_t dest_path_len
) {
  (void)user;

  char* buffer = 0;
  size_t byte_len = 0;
  inox_status status = inox_fs_default_read_file_data(src_path, src_path_len, &buffer, &byte_len);

  if (status == INOX_OK) {
    status = inox_fs_default_write_file_with_mode(dest_path, dest_path_len, buffer, byte_len, "wb");
  }

  free(buffer);

  return status;
}

static inox_status inox_fs_default_symlink(void* user, const char* target, size_t target_len, const char* path, size_t path_len) {
  (void)user;

  if ((target == 0 && target_len != 0) || (path == 0 && path_len != 0)) {
    return INOX_ERR_TYPE;
  }

#ifdef _WIN32
  (void)target;
  (void)target_len;
  (void)path;
  (void)path_len;
  return INOX_ERR_UNSUPPORTED;
#else
  char* target_copy = 0;
  char* path_copy = 0;
  inox_status status = inox_fs_copy_host_bytes(target, target_len, &target_copy);

  if (status == INOX_OK) {
    status = inox_fs_copy_host_bytes(path, path_len, &path_copy);
  }

  if (status != INOX_OK) {
    free(target_copy);
    free(path_copy);
    return status;
  }

  int result = symlink(target_copy, path_copy);
  free(target_copy);
  free(path_copy);

  return result == 0 ? INOX_OK : INOX_ERR_FIELD;
#endif
}

static inox_status inox_fs_default_write_file(void* user, const char* path, size_t path_len, const char* bytes, size_t byte_len) {
  (void)user;

  return inox_fs_default_write_file_with_mode(path, path_len, bytes, byte_len, "wb");
}
#endif

static inox_status inox_fs_queue_request(
  inox_loop* loop,
  FsRequestKind kind,
  const char* path,
  size_t path_len,
  const char* path2,
  size_t path2_len,
  const char* bytes,
  size_t byte_len,
  int mode,
  bool recursive,
  bool force,
  inox_promise** out
) {
  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;

  if (
    loop == 0 || loop->allocator == 0 || loop->allocator->alloc == 0 || (path == 0 && path_len != 0) ||
    (path2 == 0 && path2_len != 0) ||
    (bytes == 0 && byte_len != 0)
  ) {
    return INOX_ERR_TYPE;
  }

  inox_promise* promise = 0;
  inox_status status = inox_promise_new(loop, &promise);

  if (status != INOX_OK) {
    return status;
  }

  FsRequest* request = (FsRequest*)loop->allocator->alloc(loop->allocator->user, sizeof(FsRequest), alignof(FsRequest));

  if (request == 0) {
    inox_promise_release(promise);
    return INOX_ERR_OOM;
  }

  request->loop = loop;
  request->promise = promise;
  request->kind = kind;
  request->path = 0;
  request->path_len = path_len;
  request->path2 = 0;
  request->path2_len = path2_len;
  request->bytes = 0;
  request->byte_len = byte_len;
  request->mode = mode;
  request->recursive = recursive;
  request->force = force;
  inox_promise_retain(promise);

  status = inox_fs_copy_bytes(loop->allocator, path, path_len, &request->path);

  if (status == INOX_OK && (kind == INOX_FS_REQUEST_COPY_FILE || kind == INOX_FS_REQUEST_RENAME || kind == INOX_FS_REQUEST_SYMLINK)) {
    status = inox_fs_copy_bytes(loop->allocator, path2, path2_len, &request->path2);
  }

  if (status == INOX_OK && (kind == INOX_FS_REQUEST_APPEND_FILE || kind == INOX_FS_REQUEST_WRITE_FILE)) {
    status = inox_fs_copy_bytes(loop->allocator, bytes, byte_len, &request->bytes);
  }

  if (status == INOX_OK) {
    status = inox_loop_queue_immediate(loop, inox_fs_run_request, request, inox_fs_request_finalizer, 0);
  }

  if (status != INOX_OK) {
    inox_fs_request_finalizer(request);
    inox_promise_release(promise);
    return status;
  }

  *out = promise;

  return INOX_OK;
}

static inox_status inox_fs_run_request(void* context) {
  FsRequest* request = (FsRequest*)context;

  if (request == 0 || request->loop == 0 || request->promise == 0) {
    return INOX_ERR_TYPE;
  }

  if (request->kind == INOX_FS_REQUEST_READ_FILE) {
    inox_value result = inox_undefined_value();
    inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_file(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_file(0, request->loop->allocator, request->path, request->path_len, &result);
#endif

    if (status != INOX_OK) {
      return inox_fs_reject_status(request->loop, request->promise, status);
    }

    inox_status resolve_status = inox_promise_resolve(request->promise, result);
    inox_release(result);

    return resolve_status;
  }

  if (request->kind == INOX_FS_REQUEST_READ_FILE_BYTES) {
    inox_value result = inox_undefined_value();
    inox_status status = fs_read_file_bytes_sync_status(request->loop->allocator, request->path, request->path_len, &result);

    if (status != INOX_OK) {
      return inox_fs_reject_request_status(request, status);
    }

    inox_status resolve_status = inox_promise_resolve(request->promise, result);
    inox_release(result);

    return resolve_status;
  }

  if (request->kind == INOX_FS_REQUEST_READ_DIR) {
    inox_value result = inox_undefined_value();
    inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_dir(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_dir(0, request->loop->allocator, request->path, request->path_len, &result);
#endif

    if (status != INOX_OK) {
      return inox_fs_reject_status(request->loop, request->promise, status);
    }

    inox_status resolve_status = inox_promise_resolve(request->promise, result);
    inox_release(result);

    return resolve_status;
  }

  if (request->kind == INOX_FS_REQUEST_READ_DIR_DIRENTS) {
    inox_value result = inox_undefined_value();
    inox_status status = INOX_ERR_UNSUPPORTED;

#ifdef INOX_LOOP_BACKEND_LIBUV
    status = inox_fs_libuv_read_dir_dirents(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
    status = inox_fs_default_read_dir_dirents(0, request->loop->allocator, request->path, request->path_len, &result);
#endif

    if (status != INOX_OK) {
      return inox_fs_reject_status(request->loop, request->promise, status);
    }

    inox_status resolve_status = inox_promise_resolve(request->promise, result);
    inox_release(result);

    return resolve_status;
  }

  if (request->kind == INOX_FS_REQUEST_STAT || request->kind == INOX_FS_REQUEST_LSTAT) {
    inox_value result = inox_undefined_value();
    inox_status status = INOX_ERR_UNSUPPORTED;

    if (request->kind == INOX_FS_REQUEST_STAT) {
#ifdef INOX_LOOP_BACKEND_LIBUV
      status = inox_fs_libuv_stat(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
      status = inox_fs_default_stat(0, request->loop->allocator, request->path, request->path_len, &result);
#endif
    } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
      status = inox_fs_libuv_lstat(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
      status = inox_fs_default_lstat(0, request->loop->allocator, request->path, request->path_len, &result);
#endif
    }

    if (status != INOX_OK) {
      return inox_fs_reject_status(request->loop, request->promise, status);
    }

    inox_status resolve_status = inox_promise_resolve(request->promise, result);
    inox_release(result);

    return resolve_status;
  }

  if (request->kind == INOX_FS_REQUEST_REALPATH || request->kind == INOX_FS_REQUEST_READLINK) {
    inox_value result = inox_undefined_value();
    inox_status status = INOX_ERR_UNSUPPORTED;

    if (request->kind == INOX_FS_REQUEST_REALPATH) {
#ifdef INOX_LOOP_BACKEND_LIBUV
      status = inox_fs_libuv_realpath(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
      status = inox_fs_default_realpath(0, request->loop->allocator, request->path, request->path_len, &result);
#endif
    } else {
#ifdef INOX_LOOP_BACKEND_LIBUV
      status = inox_fs_libuv_readlink(0, request->loop->allocator, request->path, request->path_len, &result);
#elif !defined(INOX_FS_DISABLE_HOST)
      status = inox_fs_default_readlink(0, request->loop->allocator, request->path, request->path_len, &result);
#endif
    }

    if (status != INOX_OK) {
      return inox_fs_reject_status(request->loop, request->promise, status);
    }

    inox_status resolve_status = inox_promise_resolve(request->promise, result);
    inox_release(result);

    return resolve_status;
  }

  if (request->kind == INOX_FS_REQUEST_ACCESS) {
    fs.accessSync(inox::StringView(request->path, request->path_len), request->mode);

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_MKDIR) {
    fs.mkdirSync(inox::StringView(request->path, request->path_len), request->recursive);

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_UNLINK) {
    fs.unlinkSync(inox::StringView(request->path, request->path_len));

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_RM) {
    fs.rmSync(inox::StringView(request->path, request->path_len), request->recursive, request->force);

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_RENAME) {
    fs.renameSync(
      inox::StringView(request->path, request->path_len),
      inox::StringView(request->path2, request->path2_len)
    );

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_APPEND_FILE) {
    fs.appendFileSync(
      inox::StringView(request->path, request->path_len),
      inox::StringView(request->bytes, request->byte_len)
    );

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_COPY_FILE) {
    fs.copyFileSync(
      inox::StringView(request->path, request->path_len),
      inox::StringView(request->path2, request->path2_len)
    );

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  if (request->kind == INOX_FS_REQUEST_SYMLINK) {
    fs.symlinkSync(
      inox::StringView(request->path, request->path_len),
      inox::StringView(request->path2, request->path2_len)
    );

    if (inox::thrown()) {
      return inox_fs_reject_thrown(request->promise);
    }

    return inox_promise_resolve(request->promise, inox_undefined_value());
  }

  fs.writeFileSync(
    inox::StringView(request->path, request->path_len),
    inox::StringView(request->bytes, request->byte_len)
  );

  if (inox::thrown()) {
    return inox_fs_reject_thrown(request->promise);
  }

  return inox_promise_resolve(request->promise, inox_undefined_value());
}

static inox_status inox_fs_reject_status(inox_loop* loop, inox_promise* promise, inox_status status) {
  if (loop == 0 || promise == 0 || loop->allocator == 0) {
    return INOX_ERR_TYPE;
  }

  inox_value error = inox_undefined_value();
  inox_status error_status = inox_fs_error_from_status(loop->allocator, status, &error);

  if (error_status != INOX_OK) {
    return inox_promise_reject(promise, inox_number_value((inox_number)status));
  }

  inox_status reject_status = inox_promise_reject(promise, error);
  inox_release(error);

  return reject_status == INOX_OK ? INOX_OK : reject_status;
}

static inox_status inox_fs_reject_request_status(FsRequest* request, inox_status status) {
  if (status == INOX_ERR_THROW) {
    return inox_fs_reject_thrown(request == 0 ? 0 : request->promise);
  }

  return inox_fs_reject_status(request == 0 ? 0 : request->loop, request == 0 ? 0 : request->promise, status);
}

static inox_status inox_fs_reject_thrown(inox_promise* promise) {
  if (promise == 0 || !inox::thrown()) {
    return INOX_ERR_TYPE;
  }

  inox::Value error = inox::take_exception();
  return inox_promise_reject(promise, error.raw());
}

static void inox_fs_throw_status(inox_status status) {
  inox_value error = inox_undefined_value();

  if (inox_fs_error_from_status(&inox_default_allocator, status, &error) == INOX_OK) {
    inox::throw_value(inox::Value(inox::adopt_value, error));
    return;
  }

  inox::throw_value(inox::String("FsError"));
}

static void inox_fs_throw_status_if_needed(inox_status status) {
  if (status == INOX_OK) {
    return;
  }

  if (status == INOX_ERR_THROW && inox::thrown()) {
    return;
  }

  inox_fs_throw_status(status);
}

static inox_status inox_fs_error_from_status(inox_allocator* allocator, inox_status status, inox_value* out) {
  static const inox_field_info fields[] = { { "name", INOX_FIELD_READONLY },
                                            { "message", INOX_FIELD_READONLY },
                                            { "code", INOX_FIELD_READONLY } };
  static const inox_shape shape = { 3, fields };

  if (allocator == 0 || out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();

  inox_value error = inox_undefined_value();
  inox::String name;
  inox::String message;
  inox::String code;
  inox_status result = inox_object_new(allocator, &shape, &error);

  if (result == INOX_OK) {
    name = inox::String("FsError", 7);
    result = name.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  const char* message_text = inox_fs_error_message(status);

  if (result == INOX_OK) {
    message = inox::String(message_text, strlen(message_text));
    result = message.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  const char* code_text = inox_fs_error_code(status);

  if (result == INOX_OK) {
    code = inox::String(code_text, strlen(code_text));
    result = code.valid() ? INOX_OK : INOX_ERR_OOM;
  }

  if (result == INOX_OK) {
    result = inox_object_init_known(error, 0, name);
  }

  if (result == INOX_OK) {
    result = inox_object_init_known(error, 1, message);
  }

  if (result == INOX_OK) {
    result = inox_object_init_known(error, 2, code);
  }

  if (result != INOX_OK) {
    inox_release(error);
    return result;
  }

  *out = error;

  return INOX_OK;
}

static const char* inox_fs_error_code(inox_status status) {
  if (status == INOX_ERR_UNSUPPORTED) {
    return "ERR_FS_UNSUPPORTED";
  }

  if (status == INOX_ERR_TYPE) {
    return "ERR_FS_TYPE";
  }

  if (status == INOX_ERR_OOM) {
    return "ERR_FS_OOM";
  }

  if (status == INOX_ERR_READONLY) {
    return "ERR_FS_READONLY";
  }

  return "ERR_FS_OPERATION";
}

static const char* inox_fs_error_message(inox_status status) {
  if (status == INOX_ERR_UNSUPPORTED) {
    return "filesystem implementation is unavailable";
  }

  if (status == INOX_ERR_TYPE) {
    return "invalid filesystem argument";
  }

  if (status == INOX_ERR_OOM) {
    return "out of memory during filesystem operation";
  }

  if (status == INOX_ERR_READONLY) {
    return "filesystem target is readonly";
  }

  return "filesystem operation failed";
}

static void inox_fs_request_finalizer(void* context) {
  FsRequest* request = (FsRequest*)context;

  if (request == 0 || request->loop == 0 || request->loop->allocator == 0 || request->loop->allocator->free == 0) {
    return;
  }

  inox_allocator* allocator = request->loop->allocator;

  if (request->path != 0) {
    allocator->free(allocator->user, request->path, request->path_len + 1, alignof(char));
  }

  if (request->path2 != 0) {
    allocator->free(allocator->user, request->path2, request->path2_len + 1, alignof(char));
  }

  if (request->bytes != 0) {
    allocator->free(allocator->user, request->bytes, request->byte_len + 1, alignof(char));
  }

  inox_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(FsRequest), alignof(FsRequest));
}
