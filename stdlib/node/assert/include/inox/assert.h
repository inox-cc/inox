#ifndef INOX_ASSERT_H
#define INOX_ASSERT_H

#include "inox/callback.h"
#include "inox/string_view.h"
#include "inox/value.h"

class AssertModule {
public:
  void operator()(const inox::Value& value) const;
  void operator()(const inox::Value& value, inox::StringView message) const;
  void ok(const inox::Value& value) const;
  void ok(const inox::Value& value, inox::StringView message) const;
  void strictEqual(const inox::Value& actual, const inox::Value& expected) const;
  void strictEqual(const inox::Value& actual, const inox::Value& expected, inox::StringView message) const;
  void notStrictEqual(const inox::Value& actual, const inox::Value& expected) const;
  void notStrictEqual(const inox::Value& actual, const inox::Value& expected, inox::StringView message) const;
  void deepStrictEqual(const inox::Value& actual, const inox::Value& expected) const;
  void deepStrictEqual(const inox::Value& actual, const inox::Value& expected, inox::StringView message) const;
  void notDeepStrictEqual(const inox::Value& actual, const inox::Value& expected) const;
  void notDeepStrictEqual(const inox::Value& actual, const inox::Value& expected, inox::StringView message) const;
  void fail() const;
  void fail(inox::StringView message) const;
  void throws(inox::Callback block) const;
  void throws(inox::Callback block, inox::StringView message) const;
  void doesNotThrow(inox::Callback block) const;
  void doesNotThrow(inox::Callback block, inox::StringView message) const;
};

extern const AssertModule nodeAssert;

#endif
