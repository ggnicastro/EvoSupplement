# Portable launcher implementation

These are developer sources. Recipients extract the Builder's portable ZIP and
open its `Abrir-suplemento` launcher; they do not run the build or test commands.

| Builder target | ZIP launcher | Implementation / requirement |
| --- | --- | --- |
| `windows` | `Abrir-suplemento.cmd` | Windows PowerShell 5 and .NET Framework already supplied by Windows; compiles `_portable/launcher.cs` locally with `Add-Type`. No execution-policy changes. Organizational application-control rules may block it. |
| `macos` | `Abrir-suplemento.command` | `/usr/bin/perl` plus Perl core modules; serves `_portable/server.pl`. The wrapper checks the runtime is present. Works with the system's Intel or Apple Silicon runtime. No downloaded packages. |
| `linux-amd64` | `Abrir-suplemento` | Linux x86-64, **glibc 2.34 or newer**, standard ELF loader `/lib64/ld-linux-x86-64.so.2`; desktop terminal and browser for double-click use. The binary dynamically links the system C library; glibc is not redistributed. |

All implementations listen exclusively on `127.0.0.1`, use an OS-assigned port,
open the default browser, and serve read-only regular publication files. The
console must stay open. Close it or press Ctrl+C to stop. The Linux binary
reopens itself in an installed desktop terminal when started without a terminal;
if no supported terminal is found, it exits instead of leaving a hidden service.
Normal operating-system trust prompts still apply to downloaded launchers.

Requests support GET, HEAD and single byte ranges, with streaming for large files.
They reject foreign Host/Origin headers, path traversal, dotfiles, symbolic links
or Windows reparse points, the `_portable` directory and launcher control files.
Directory listing is disabled. Other supplementary files, including scientific
source code, are served as static downloads and never executed.

## Build and test (development only)

From the project root, on Linux x86-64 with a C compiler:

```sh
sh builder/portable/launcher/build-linux.sh
python3 builder/portable/launcher/test_launchers.py
```

The build writes `builder/portable/bin/linux-amd64/evosupplement`. Build against
glibc 2.34 or check the resulting version requirements if using a newer toolchain:

```sh
readelf --version-info builder/portable/bin/linux-amd64/evosupplement
```

The distributed binary was checked to require no GLIBC symbol newer than 2.34.
No Go toolchain, Python interpreter, compiler or package manager is required on a
recipient's machine.

The native binary supports `--root FOLDER` and `--no-browser` for diagnostics.
The Perl launcher accepts the publication folder as its first argument.
`EVOSUPPLEMENT_NO_BROWSER=1` suppresses browser/terminal launching in both of these
servers during automated tests.

## Validation and limits

Runtime tests passed for the native Linux server and Perl server under Linux:
Unicode/spaced filenames, supplementary source downloads, streaming, HEAD/ranges,
directory routing, concurrent requests, idle browser preconnections, path and
origin protections, and SIGTERM shutdown. Python is only the development test
runner.

The Windows C# source and CMD wrapper were reviewed but could not be compiled or
executed in this Linux environment. The macOS wrapper and actual Finder launch
were not run on macOS; the Perl server logic was run under Linux. Native Windows
and macOS acceptance testing remains recommended before broad distribution.
Apple's macOS Tahoe security release notes include the system Perl component:
<https://support.apple.com/en-us/125110>. Future macOS versions may change runtime
availability; the wrapper fails clearly and does not install anything.

Launcher source code is covered by the project's MIT [LICENSE](../../../LICENSE).
The Builder includes that license as `_portable/LICENSE.txt` in each portable ZIP.
