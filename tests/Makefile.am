check_PROGRAMS = test_termcolors example
test_termcolors_SOURCES = test_termcolors.c
test_termcolors_LDADD = $(top_builddir)/src/libtermcolors.la
test_termcolors_CPPFLAGS = -I$(top_srcdir)/src -I$(top_builddir)

example_SOURCES = example.c
example_LDADD = $(top_builddir)/src/libtermcolors.la
example_CPPFLAGS = -I$(top_srcdir)/src -I$(top_builddir)

TESTS = test_termcolors example

# Create a persistent colorscheme for the example test
CONFIG_DIR = $(abs_builddir)/config
SCHEME_DIR = $(CONFIG_DIR)/terminal-colors.d
SCHEME_FILE = $(SCHEME_DIR)/mytool.scheme

$(SCHEME_FILE):
	$(MKDIR_P) $(SCHEME_DIR)
	echo "header blue" > $@
	echo "error red" >> $@

# Ensure the scheme file is created before running tests
check-local: $(SCHEME_FILE)

# Set XDG_CONFIG_HOME for the example test
TESTS_ENVIRONMENT = XDG_CONFIG_HOME=$(CONFIG_DIR)

clean-local:
	rm -rf $(CONFIG_DIR)
