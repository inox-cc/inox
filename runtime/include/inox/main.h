#ifndef INOX_MAIN_H
#define INOX_MAIN_H

#ifdef __cplusplus

#include "inox/loop.h"
#include "inox/string_view.h"

namespace inox {

using AppMain = void (*)(void);

int return_code();
int run_app(AppMain app_main);
int main(AppMain app_main);
int main(int argc, char** argv, AppMain app_main);
int main(int argc, char** argv, StringView entry_path, AppMain app_main);

} // namespace inox

#endif

#endif
