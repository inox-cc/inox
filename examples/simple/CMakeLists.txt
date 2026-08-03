cmake_minimum_required(VERSION 3.20)

project(inox_cmake_example C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(INOX_TOOLCHAIN_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
set(INOX_COMPILER_MODE "node" CACHE STRING "Inox compiler runner")
set_property(CACHE INOX_COMPILER_MODE PROPERTY STRINGS node native)

include("${INOX_TOOLCHAIN_ROOT}/cmake/Inox.cmake")

inox_add_executable(inox_cmake_example
  ENTRY "src/index.ts"
)
