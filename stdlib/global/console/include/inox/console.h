#ifndef INOX_CONSOLE_H
#define INOX_CONSOLE_H

#include <stddef.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/string.h"
#include "inox/string_view.h"

namespace inox {

enum class ConsoleStream {
  stdout,
  stderr
};

enum class ConsoleArgKind {
  empty,
  signed_integer,
  unsigned_integer,
  number,
  c_string,
  string_view,
  string,
  value
};

class ConsoleArg {
public:
  ConsoleArgKind kind;
  long long signed_integer;
  unsigned long long unsigned_integer;
  double number;
  const char* bytes;
  size_t len;
  const String* string;
  inox_value value;

  ConsoleArg();
  ConsoleArg(bool value);
  ConsoleArg(char value);
  ConsoleArg(signed char value);
  ConsoleArg(unsigned char value);
  ConsoleArg(short value);
  ConsoleArg(unsigned short value);
  ConsoleArg(int value);
  ConsoleArg(unsigned int value);
  ConsoleArg(long value);
  ConsoleArg(unsigned long value);
  ConsoleArg(long long value);
  ConsoleArg(unsigned long long value);
  ConsoleArg(float value);
  ConsoleArg(double value);
  ConsoleArg(const char* value);
  ConsoleArg(StringView value);
  ConsoleArg(const String& value);
  ConsoleArg(const Value& value);
};

String console_format_class_instance(
  const inox_class_descriptor& descriptor,
  const void* instance
);

} // namespace inox

class console {
public:
  void log() const;
  void log(inox::StringView text) const;
  void log(const inox::Value& value) const;
  void log(
    inox::StringView format,
    inox::ConsoleArg arg0,
    inox::ConsoleArg arg1 = inox::ConsoleArg(),
    inox::ConsoleArg arg2 = inox::ConsoleArg(),
    inox::ConsoleArg arg3 = inox::ConsoleArg(),
    inox::ConsoleArg arg4 = inox::ConsoleArg(),
    inox::ConsoleArg arg5 = inox::ConsoleArg(),
    inox::ConsoleArg arg6 = inox::ConsoleArg(),
    inox::ConsoleArg arg7 = inox::ConsoleArg(),
    inox::ConsoleArg arg8 = inox::ConsoleArg(),
    inox::ConsoleArg arg9 = inox::ConsoleArg(),
    inox::ConsoleArg arg10 = inox::ConsoleArg(),
    inox::ConsoleArg arg11 = inox::ConsoleArg(),
    inox::ConsoleArg arg12 = inox::ConsoleArg(),
    inox::ConsoleArg arg13 = inox::ConsoleArg(),
    inox::ConsoleArg arg14 = inox::ConsoleArg(),
    inox::ConsoleArg arg15 = inox::ConsoleArg()
  ) const;

  void info() const;
  void info(inox::StringView text) const;
  void info(const inox::Value& value) const;
  void info(
    inox::StringView format,
    inox::ConsoleArg arg0,
    inox::ConsoleArg arg1 = inox::ConsoleArg(),
    inox::ConsoleArg arg2 = inox::ConsoleArg(),
    inox::ConsoleArg arg3 = inox::ConsoleArg(),
    inox::ConsoleArg arg4 = inox::ConsoleArg(),
    inox::ConsoleArg arg5 = inox::ConsoleArg(),
    inox::ConsoleArg arg6 = inox::ConsoleArg(),
    inox::ConsoleArg arg7 = inox::ConsoleArg(),
    inox::ConsoleArg arg8 = inox::ConsoleArg(),
    inox::ConsoleArg arg9 = inox::ConsoleArg(),
    inox::ConsoleArg arg10 = inox::ConsoleArg(),
    inox::ConsoleArg arg11 = inox::ConsoleArg(),
    inox::ConsoleArg arg12 = inox::ConsoleArg(),
    inox::ConsoleArg arg13 = inox::ConsoleArg(),
    inox::ConsoleArg arg14 = inox::ConsoleArg(),
    inox::ConsoleArg arg15 = inox::ConsoleArg()
  ) const;

  void warn() const;
  void warn(inox::StringView text) const;
  void warn(const inox::Value& value) const;
  void warn(
    inox::StringView format,
    inox::ConsoleArg arg0,
    inox::ConsoleArg arg1 = inox::ConsoleArg(),
    inox::ConsoleArg arg2 = inox::ConsoleArg(),
    inox::ConsoleArg arg3 = inox::ConsoleArg(),
    inox::ConsoleArg arg4 = inox::ConsoleArg(),
    inox::ConsoleArg arg5 = inox::ConsoleArg(),
    inox::ConsoleArg arg6 = inox::ConsoleArg(),
    inox::ConsoleArg arg7 = inox::ConsoleArg(),
    inox::ConsoleArg arg8 = inox::ConsoleArg(),
    inox::ConsoleArg arg9 = inox::ConsoleArg(),
    inox::ConsoleArg arg10 = inox::ConsoleArg(),
    inox::ConsoleArg arg11 = inox::ConsoleArg(),
    inox::ConsoleArg arg12 = inox::ConsoleArg(),
    inox::ConsoleArg arg13 = inox::ConsoleArg(),
    inox::ConsoleArg arg14 = inox::ConsoleArg(),
    inox::ConsoleArg arg15 = inox::ConsoleArg()
  ) const;

  void error() const;
  void error(inox::StringView text) const;
  void error(const inox::Value& value) const;
  void error(
    inox::StringView format,
    inox::ConsoleArg arg0,
    inox::ConsoleArg arg1 = inox::ConsoleArg(),
    inox::ConsoleArg arg2 = inox::ConsoleArg(),
    inox::ConsoleArg arg3 = inox::ConsoleArg(),
    inox::ConsoleArg arg4 = inox::ConsoleArg(),
    inox::ConsoleArg arg5 = inox::ConsoleArg(),
    inox::ConsoleArg arg6 = inox::ConsoleArg(),
    inox::ConsoleArg arg7 = inox::ConsoleArg(),
    inox::ConsoleArg arg8 = inox::ConsoleArg(),
    inox::ConsoleArg arg9 = inox::ConsoleArg(),
    inox::ConsoleArg arg10 = inox::ConsoleArg(),
    inox::ConsoleArg arg11 = inox::ConsoleArg(),
    inox::ConsoleArg arg12 = inox::ConsoleArg(),
    inox::ConsoleArg arg13 = inox::ConsoleArg(),
    inox::ConsoleArg arg14 = inox::ConsoleArg(),
    inox::ConsoleArg arg15 = inox::ConsoleArg()
  ) const;
};

extern console console;

#endif

#endif
