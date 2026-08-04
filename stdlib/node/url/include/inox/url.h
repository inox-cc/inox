#ifndef INOX_URL_H
#define INOX_URL_H

#include "inox/object.h"
#include "inox/value.h"

#ifdef __cplusplus
#include <initializer_list>

#include "inox/array.h"
#include "inox/string.h"
#include "inox/string_view.h"

class URL : public inox::Value {
public:
  URL();
  explicit URL(const inox::Value& value);
  explicit URL(inox::Value&& value);

  using inox::Value::operator=;

  static URL from(const inox::Value& input, const inox::Value& base, bool has_base);

  bool valid() const;
  inox::String href() const;
  inox::String protocol() const;
  inox::String hostname() const;
  inox::String port() const;
  inox::String pathname() const;
  inox::String search() const;
  inox::String hash() const;
  inox::String toJSON() const;
  inox::String toString() const;
  void setPathname(const inox::Value& value);
  void setSearch(const inox::Value& value);
  void setHash(const inox::Value& value);

private:
  void setField(uint32_t field_index, const inox::Value& value);
};

class URLSearchParams : public inox::Value {
public:
  struct Entry {
    inox::StringView name;
    inox::StringView value;
  };

  URLSearchParams();
  explicit URLSearchParams(const inox::Value& value);
  explicit URLSearchParams(inox::Value&& value);

  using inox::Value::operator=;

  static URLSearchParams from(const inox::Value& init);
  static URLSearchParams from(inox::StringView init);
  static URLSearchParams from(std::initializer_list<Entry> init);

  bool valid() const;
  void append(inox::StringView name, inox::StringView value);
  inox::Value get(inox::StringView name) const;
  Array getAll(inox::StringView name) const;
  bool has(inox::StringView name) const;
  double size() const;
  void remove(inox::StringView name);
  void set(inox::StringView name, inox::StringView value);
  void sort();
  inox::String toString() const;
};

class url {
public:
  inox::String fileURLToPath(const inox::Value& value) const;
  URL pathToFileURL(const inox::Value& path) const;
};

extern url url;

#endif

#endif
