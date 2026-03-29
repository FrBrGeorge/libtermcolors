check_PROGRAMS = test_termcolors example
test_termcolors_SOURCES = test_termcolors.c
test_termcolors_LDADD = $(top_builddir)/src/libtermcolors.la
test_termcolors_CPPFLAGS = -I$(top_srcdir)/src -I$(top_builddir)

example_SOURCES = example.c
example_LDADD = $(top_builddir)/src/libtermcolors.la
example_CPPFLAGS = -I$(top_srcdir)/src -I$(top_builddir)

TESTS = test_termcolors example
