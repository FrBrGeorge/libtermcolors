# libtermcolors

A library for terminal colorization scheme handling according to the `terminal-colors.d(5)` specification.

## Usage Example

```c
#include <termcolors.h>
#include <stdio.h>
#include <stdlib.h>

int main() {
    char *filename = NULL;
    int res = colorscheme("mytool", "xterm", &filename);
    
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

## Build and Install

```bash
autoreconf -fi
./configure
make
sudo make install
```
