ACLOCAL_AMFLAGS = -I m4

lib_LTLIBRARIES = libtermcolors.la
libtermcolors_la_SOURCES = src/termcolors.c
libtermcolors_la_CPPFLAGS = -DSYSCONFDIR='"$(sysconfdir)"'
libtermcolors_la_LDFLAGS = -version-info 1:0:0

include_HEADERS = src/termcolors.h

pkgconfigdir = $(libdir)/pkgconfig
pkgconfig_DATA = libtermcolors.pc

man3_MANS = libtermcolors.3

check_PROGRAMS = test_termcolors
test_termcolors_SOURCES = tests/test_termcolors.c
test_termcolors_LDADD = libtermcolors.la
test_termcolors_CPPFLAGS = -I$(srcdir)/src

TESTS = test_termcolors

EXTRA_DIST = $(man3_MANS)
