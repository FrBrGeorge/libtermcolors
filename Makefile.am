ACLOCAL_AMFLAGS = -I m4
SUBDIRS = src

check_PROGRAMS = test_termcolors
test_termcolors_SOURCES = tests/test_termcolors.c
test_termcolors_LDADD = src/libtermcolors.la
test_termcolors_CPPFLAGS = -I$(srcdir)/src -I$(top_builddir)

TESTS = test_termcolors
