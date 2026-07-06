#ifndef INOX_OS_H
#define INOX_OS_H

#ifdef __cplusplus

#include "inox/string.h"

class os {
public:
  inox::String EOL;

  os();
  inox::String arch() const;
  inox::String homedir() const;
  inox::String hostname() const;
  inox::String platform() const;
  inox::String release() const;
  inox::String tmpdir() const;
  inox::String type() const;
};

extern os os;

#endif

#endif
