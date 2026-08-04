#ifndef INOX_OS_H
#define INOX_OS_H

#ifdef __cplusplus

#include "inox/array.h"
#include "inox/string.h"

class os {
public:
  inox::String EOL;
  inox::String devNull;

  os();
  double availableParallelism() const;
  inox::String arch() const;
  inox::String endianness() const;
  double freemem() const;
  inox::String homedir() const;
  inox::String hostname() const;
  Array loadavg() const;
  inox::String machine() const;
  inox::String platform() const;
  inox::String release() const;
  inox::String tmpdir() const;
  double totalmem() const;
  inox::String type() const;
  double uptime() const;
  inox::String version() const;
};

extern os os;

#endif

#endif
