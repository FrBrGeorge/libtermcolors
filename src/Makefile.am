lib_LTLIBRARIES = libtermcolors.la
libtermcolors_la_SOURCES = termcolors.c
libtermcolors_la_CPPFLAGS = -DSYSCONFDIR='"$(sysconfdir)"' -I$(top_builddir)
libtermcolors_la_LDFLAGS = -version-info 1:0:0

include_HEADERS = termcolors.h

pkgconfigdir = $(libdir)/pkgconfig
pkgconfig_DATA = libtermcolors.pc

man3_MANS = libtermcolors.3
EXTRA_DIST = $(man3_MANS)
