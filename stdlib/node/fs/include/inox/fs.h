#ifndef INOX_FS_H
#define INOX_FS_H

#include "inox/array.h"
#include "inox/buffer.h"
#include "inox/callback.h"
#include "inox/promise.h"
#include "inox/string.h"
#include "inox/string_view.h"
#include "inox/value.h"

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

class FsStats;

class FsConstants {
public:
  FsConstants();

  const double F_OK;
  const double R_OK;
  const double W_OK;
  const double X_OK;
};

struct FsReadDirOptions {
  bool withFileTypes;
};

class fs_promises {
public:
  inox::Promise readFile(inox::StringView path);
  inox::Promise readFile(inox::StringView path, inox::StringView encoding);
  inox::Promise readdir(inox::StringView path);
  inox::Promise readdir(inox::StringView path, inox::StringView encoding);
  inox::Promise readdir(inox::StringView path, FsReadDirOptions options);
  inox::Promise stat(inox::StringView path);
  inox::Promise lstat(inox::StringView path);
  inox::Promise realpath(inox::StringView path);
  inox::Promise readlink(inox::StringView path);
  inox::Promise access(inox::StringView path);
  inox::Promise access(inox::StringView path, int mode);
  inox::Promise mkdir(inox::StringView path, bool recursive);
  inox::Promise rm(inox::StringView path, bool recursive, bool force);
  inox::Promise writeFile(inox::StringView path, inox::StringView bytes);
  inox::Promise writeFile(inox::StringView path, Uint8Array bytes);
  inox::Promise appendFile(inox::StringView path, inox::StringView bytes);
  inox::Promise appendFile(inox::StringView path, Uint8Array bytes);
  inox::Promise copyFile(inox::StringView src_path, inox::StringView dest_path);
  inox::Promise symlink(inox::StringView target, inox::StringView path);
  inox::Promise rename(inox::StringView old_path, inox::StringView new_path);
  inox::Promise unlink(inox::StringView path);
};

class fs {
public:
  const FsConstants constants;
  fs_promises promises;

  void access(inox::StringView path, inox::Callback callback);
  void access(inox::StringView path, int mode, inox::Callback callback);
  void appendFile(inox::StringView path, inox::StringView bytes, inox::Callback callback);
  void appendFile(inox::StringView path, Uint8Array bytes, inox::Callback callback);
  void copyFile(inox::StringView src_path, inox::StringView dest_path, inox::Callback callback);
  void lstat(inox::StringView path, inox::Callback callback);
  void mkdir(inox::StringView path, inox::Callback callback);
  void mkdir(inox::StringView path, bool recursive, inox::Callback callback);
  void readFile(inox::StringView path, inox::Callback callback);
  void readFile(inox::StringView path, inox::StringView encoding, inox::Callback callback);
  void readdir(inox::StringView path, inox::Callback callback);
  void readdir(inox::StringView path, inox::StringView encoding, inox::Callback callback);
  void readdir(inox::StringView path, FsReadDirOptions options, inox::Callback callback);
  void readlink(inox::StringView path, inox::Callback callback);
  void realpath(inox::StringView path, inox::Callback callback);
  void rename(inox::StringView old_path, inox::StringView new_path, inox::Callback callback);
  void rm(inox::StringView path, inox::Callback callback);
  void rm(inox::StringView path, bool recursive, bool force, inox::Callback callback);
  void stat(inox::StringView path, inox::Callback callback);
  void symlink(inox::StringView target, inox::StringView path, inox::Callback callback);
  void unlink(inox::StringView path, inox::Callback callback);
  void writeFile(inox::StringView path, inox::StringView bytes, inox::Callback callback);
  void writeFile(inox::StringView path, Uint8Array bytes, inox::Callback callback);

  Buffer readFileSync(inox::StringView path);
  inox::String readFileSync(inox::StringView path, inox::StringView encoding);
  Array readdirSync(inox::StringView path);
  Array readdirSync(inox::StringView path, inox::StringView encoding);
  Array readdirSync(inox::StringView path, FsReadDirOptions options);
  FsStats statSync(inox::StringView path);
  FsStats lstatSync(inox::StringView path);
  inox::String realpathSync(inox::StringView path);
  inox::String readlinkSync(inox::StringView path);
  void accessSync(inox::StringView path);
  void accessSync(inox::StringView path, int mode);
  void mkdirSync(inox::StringView path, bool recursive);
  void unlinkSync(inox::StringView path);
  void rmSync(inox::StringView path, bool recursive, bool force);
  void appendFileSync(inox::StringView path, inox::StringView bytes);
  void appendFileSync(inox::StringView path, Uint8Array bytes);
  void copyFileSync(inox::StringView src_path, inox::StringView dest_path);
  bool existsSync(inox::StringView path);
  void symlinkSync(inox::StringView target, inox::StringView path);
  void renameSync(inox::StringView old_path, inox::StringView new_path);
  void writeFileSync(inox::StringView path, inox::StringView bytes);
  void writeFileSync(inox::StringView path, Uint8Array bytes);
};

class FsStats : public inox::Value {
public:
  FsStats();
  explicit FsStats(const inox::Value& value);
  explicit FsStats(inox::Value&& value);

  bool valid() const;
  double size() const;
  double mode() const;
  double mtimeMs() const;
  bool isFile() const;
  bool isDirectory() const;
};

class FsDirent : public inox::Value {
public:
  FsDirent();
  explicit FsDirent(const inox::Value& value);
  explicit FsDirent(inox::Value&& value);

  inox::String name() const;
  bool isFile() const;
  bool isDirectory() const;
};

extern fs fs;

#endif
