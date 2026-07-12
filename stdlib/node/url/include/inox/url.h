#ifndef INOX_URL_H
#define INOX_URL_H

#include "inox/object.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/string.h"
#include "inox/string_view.h"

class URL : public inox::Value {
public:
  URL();
  explicit URL(const inox::Value& value);
  explicit URL(inox::Value&& value);

  using inox::Value::operator=;

  static URL from(const inox::Value& input, const inox::Value& base, bool has_base, const inox_shape* shape);

  bool valid() const;
  void setPathname(const inox::Value& value);
  void setSearch(const inox::Value& value);
  void setHash(const inox::Value& value);

private:
  void setField(uint32_t field_index, const inox::Value& value);
};

class URLSearchParams : public inox::Value {
private:
  static inox::Value make(const inox::Value& init);
  static inox::Value make(inox::StringView init);

public:
  URLSearchParams();
  explicit URLSearchParams(inox::StringView init);
  explicit URLSearchParams(const inox::Value& value);
  explicit URLSearchParams(inox::Value&& value);

  using inox::Value::operator=;

  static URLSearchParams from(const inox::Value& init);

  bool valid() const;
  void append(inox::StringView name, inox::StringView value);
  inox::Value get(inox::StringView name) const;
  bool has(inox::StringView name) const;
  void remove(inox::StringView name);
  void set(inox::StringView name, inox::StringView value);
  inox::String toString() const;
};

class url {
public:
  inox::String fileURLToPath(const inox::Value& value) const;
  URL pathToFileURL(const inox::Value& path, const inox_shape* shape) const;
};

extern url url;

#endif

#endif
