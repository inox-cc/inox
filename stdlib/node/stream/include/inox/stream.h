#ifndef INOX_STREAM_H
#define INOX_STREAM_H

#include "inox/binary.h"
#include "inox/callback.h"
#include "inox/string_view.h"
#include "inox/value.h"

class Stream : public inox::Value {
public:
  class Impl;

  Stream();
  explicit Stream(const inox::Value& value);
  explicit Stream(inox::Value&& value);

  using inox::Value::operator=;

  Stream& destroy();
  bool destroyed() const;
  Stream& end();
  Stream& end(inox::Callback callback);
  Stream& end(inox::StringView chunk);
  Stream& end(inox::StringView chunk, inox::Callback callback);
  Stream& end(const Uint8Array& chunk);
  Stream& end(const Uint8Array& chunk, inox::Callback callback);
  bool isPaused() const;
  Stream& on(inox::StringView event_name, inox::Callback listener);
  Stream& once(inox::StringView event_name, inox::Callback listener);
  Stream& pause();
  Stream pipe(Stream destination);
  bool readable() const;
  bool readableEnded() const;
  double readableLength() const;
  Stream& resume();
  bool valid() const;
  bool writable() const;
  bool writableEnded() const;
  double writableLength() const;
  bool write(inox::StringView chunk);
  bool write(inox::StringView chunk, inox::Callback callback);
  bool write(const Uint8Array& chunk);
  bool write(const Uint8Array& chunk, inox::Callback callback);
};

class Readable : public Stream {
public:
  Readable();
  explicit Readable(const inox::Value& value);
  explicit Readable(inox::Value&& value);
};

class Writable : public Stream {
public:
  Writable();
  explicit Writable(const inox::Value& value);
  explicit Writable(inox::Value&& value);
};

class Duplex : public Readable {
public:
  Duplex();
  explicit Duplex(const inox::Value& value);
  explicit Duplex(inox::Value&& value);
};

class Transform : public Duplex {
public:
  Transform();
  explicit Transform(const inox::Value& value);
  explicit Transform(inox::Value&& value);
};

class PassThrough : public Transform {
public:
  PassThrough();
  explicit PassThrough(const inox::Value& value);
  explicit PassThrough(inox::Value&& value);

  static PassThrough create();
};

#endif
