AC_PREREQ([2.69])
AC_INIT([libtermcolors], [1.0.0], [frbrgeorge@gmail.com])
AC_CONFIG_SRCDIR([src/termcolors.c])
AC_CONFIG_HEADERS([config.h])
AC_CONFIG_MACRO_DIR([m4])

AM_INIT_AUTOMAKE([foreign -Wall -Werror])
LT_INIT

# Checks for programs.
AC_PROG_CC

# Checks for libraries.

# Checks for header files.
AC_CHECK_HEADERS([stdlib.h string.h unistd.h sys/stat.h])

# Checks for typedefs, structures, and compiler characteristics.
AC_TYPE_SIZE_T

# Checks for library functions.
AC_FUNC_MALLOC
AC_CHECK_FUNCS([getenv strdup strtok_r snprintf stat access])

AC_CONFIG_FILES([Makefile
                 src/Makefile
                 src/libtermcolors.pc])
AC_OUTPUT
