#ifndef INOX_CONSOLE_H
#define INOX_CONSOLE_H

#include <stddef.h>
#include "inox/class_descriptor.h"
#include "inox/value.h"

#ifdef __cplusplus
#include "inox/string_view.h"

namespace inox {

enum class ConsoleStream {
  stdout,
  stderr
};

class String;

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
  ConsoleArg(inox_value value);
  ConsoleArg(const Value& value);
};

inox_status console_newline(ConsoleStream stream);
inox_status console_write(ConsoleStream stream, const char* bytes, size_t len);
inox_status console_write_line(ConsoleStream stream, const char* bytes, size_t len);
inox_status console_print_value(ConsoleStream stream, inox_value value);
inox_status console_print_value_line(ConsoleStream stream, inox_value value);
inox_status console_format_class_instance(
  const inox_class_descriptor& descriptor,
  const void* instance,
  Value& out
);
int console_printf(ConsoleStream stream, const char* format, ...);

} // namespace inox

class console {
public:
  void log() const;
  void log(const char* text) const;
  void log(inox::StringView text) const;
  void log(const inox::String& value) const;
  void log(inox_value value) const;
  void log(const inox::Value& value) const;
  void log(const char* prefix, inox_value value) const;
  void log(const char* prefix, const inox::Value& value) const;
  void log(const char* format, inox::StringView arg0) const;
  void log(const char* format, const inox::String& arg0) const;
  void log(
    const char* format,
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
  void info(const char* text) const;
  void info(inox::StringView text) const;
  void info(const inox::String& value) const;
  void info(inox_value value) const;
  void info(const inox::Value& value) const;
  void info(const char* prefix, inox_value value) const;
  void info(const char* prefix, const inox::Value& value) const;
  void info(const char* format, inox::StringView arg0) const;
  void info(const char* format, const inox::String& arg0) const;
  void info(
    const char* format,
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
  void warn(const char* text) const;
  void warn(inox::StringView text) const;
  void warn(const inox::String& value) const;
  void warn(inox_value value) const;
  void warn(const inox::Value& value) const;
  void warn(const char* prefix, inox_value value) const;
  void warn(const char* prefix, const inox::Value& value) const;
  void warn(const char* format, inox::StringView arg0) const;
  void warn(const char* format, const inox::String& arg0) const;
  void warn(
    const char* format,
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
  void error(const char* text) const;
  void error(inox::StringView text) const;
  void error(const inox::String& value) const;
  void error(inox_value value) const;
  void error(const inox::Value& value) const;
  void error(const char* prefix, inox_value value) const;
  void error(const char* prefix, const inox::Value& value) const;
  void error(const char* format, inox::StringView arg0) const;
  void error(const char* format, const inox::String& arg0) const;
  void error(
    const char* format,
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

private:
  static inox_status printf_line(
    inox::ConsoleStream stream,
    const char* format,
    const inox::ConsoleArg* args,
    size_t arg_count
  );

  static bool is_string_format_spec(const char* spec, size_t len);
  static bool is_value_format_spec(const char* spec, size_t len);
  static const char* next_format_spec(const char* format, const char** spec_end);
  static bool format_uses_dynamic_width_or_precision(const char* format);

  static inox_status write_format_literal(inox::ConsoleStream stream, const char* begin, const char* end);
  static inox_status write_format_arg(
    inox::ConsoleStream stream,
    const char* spec,
    size_t spec_len,
    const inox::ConsoleArg& value
  );
  static inox_status write_formatted(
    inox::ConsoleStream stream,
    const char* format,
    const inox::ConsoleArg* args,
    size_t arg_count
  );
};

extern console console;

#endif

#endif
