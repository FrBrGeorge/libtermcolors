# libtermcolors

A library for terminal colorization scheme handling according to the `terminal-colors.d(5)` specification.

## Usage Example

See `tests/example.c` for a complete, compilable example with error handling.

Short snippet:
```c
#include <termcolors.h>
#include <stdio.h>
#include <stdlib.h>

int main() {
    char *filename = NULL;
    char *term = getenv("TERM");
    int res = colorscheme("mytool", term, &filename);
    
    if (res == TERMCOLORS_SUCCESS && filename) {
        char *seq = NULL;
        char *reset = NULL;
        // Using ansi_sequence directly
        ansi_sequence("reset", &reset);
        
        // Using get_color with ansi_sequence converter
        if (get_color(filename, "header", ansi_sequence, &seq) == TERMCOLORS_SUCCESS) {
            printf("%sThis is a header%s\n", seq, reset);
            free(seq);
        }
        
        // Or using the backward compatibility macro
        if (ansi_color(filename, "error", &seq) == TERMCOLORS_SUCCESS) {
            printf("%sThis is an error%s\n", seq, reset);
            free(seq);
        }

        free(reset);
        free(filename);
    }
    
    return 0;
}
```

### Running the Example Manually

The test suite creates a persistent colorscheme in `tests/terminal-colors.d/mytool.scheme`. You can run the example manually by pointing `XDG_CONFIG_HOME` to the `tests` directory:

```bash
cd tests
XDG_CONFIG_HOME=$(pwd) ./example
```

You can also enable debug messages to see the discovery process:

```bash
TERMINAL_COLORS_DEBUG=all XDG_CONFIG_HOME=$(pwd) ./example
```

## Build and Install

```bash
autoreconf -fi
./configure
make
sudo make install
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Built with Google AI Studio Build.*
