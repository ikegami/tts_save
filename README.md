TTS Save File Extractor
=======================

`tts_save_extractor` is a command-line tool for extracting
the components from a Tabletop Simulator save file.

[![Version](https://img.shields.io/npm/v/tts_save_extractor.svg)](https://npmjs.org/package/tts_save_extractor)
[![License](https://img.shields.io/npm/l/tts_save_extractor.svg)](https://github.com/ikegami/tts_save_extractor/blob/main/LICENSE)
[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io/)
[![Downloads/month](https://img.shields.io/npm/dm/tts_save_extractor.svg)](https://npmjs.org/package/tts_save_extractor)

* [Installation](#installation)
* [Synopsis](#synopsis)
* [Usage](#usage)
* [Accuracy, Safety and Conflicts](#accuracy-conflicts-and-safety)
* [Support](#support)
* [Repository](#repository)
* [Author](#author)
* [Copyright and License](#copyright-and-license)

# Installation

```sh
npm install -g tts_save_extractor
```

# Synopsis

To extract all components of `TS_Save_000.json` into the
`out` subdirectory, use the following:

```sh
tts_save_extractor -a -o out TS_Save_000.json
```

This works whether `TS_Save_000.json` is found in the current
directory or in TTS's `Saves` directory.


# Usage

```sh
tts_save_extractor (-h|--help)
tts_save_extractor (-v|--version)
tts_save_extractor [options] [--] [TS_Save_000.json]
```

From the specified file, this tool will extract the components
indicated by the provided options. By default, nothing is extracted.

If no file is specified, the tool will read from stdin.

If a file name or relative path is provided, the tool will
first look in the current work directory. If it fails to
find the named file there, it will then look in
Tabletop Simulator's "Saves" folder.


## Options:

* `--output=DIR`, `-o DIR`

    Default: `.`

    The directory in which the extracted components should be placed.
    This directory need not exist. But it does, existing files within
    the directory will not be deleted. They may, however, be overwritten.

* `--all`, `-a`

    A shortcut for `--scripts --xml --notes --unbundle`.
    This is subject to being extended if/when new features are added.

* `--scripts`, `-s`

    Save the Lua script of every object into the `objs`
    subdirectory of the output directory.

    See `--unbundle`.

* `--xml`, `-x`

    Save the UI XML of every object into the `objs`
    subdirectory of the output directory.

    See `--unbundle`.

* `--notes`, `-n`

    Save the notebook entries into the `Notebook` subdirectory of the output directory.

* `--unbundle`, `-u`

    When used in conjunction with `--scripts`, included (`#include path`
    and `#include <path>`) scripts and required modules (`require("path")`)
    will be extracted into the `lib` subdirectory of the output directory.

    When used in conjunction with `--xml`, included XML files
    (`<Include src="path"/>`) will be extracted into the same
    directory.


# Accuracy, Conflicts and Safety

The extracted scripts and modules and XML should be byte-for-byte equivalent with the original files, with the following exceptions:

* Line endings will be normalized for the current platform (CRLF on Windows, LF elsewhere).
* Non-empty files that do not end with a line ending will be given one.

It is possible for multiple objects to have the same GUID. In such a situation,
it is possible to end up with the scripts and XML of only one of the objects.

The tool avoids using a few particularly dangerous characters in the names of files it creates.
While this could result in a file that differently named than the directive used to include it,
you should never encounter this in practice. You could end up with very oddly-named files in
the event of a maliciously-created file, and even some that contains shell metacharacters.

However, the tool constrains its output to the specified directory,
even when provided a maliciously-crafted file (e.g. one that includes
a file named `../../etc/passwd`).


# Support

If you need help, [Stack Overflow](https://stackoverflow.com/) is a great resource.

You may also contact the [author](#author) directly.

Bugs and improvements can be reported using GitHub's issue tracker at
[https://github.com/ikegami/tts_save_extractor/issues](https://github.com/ikegami/tts_save_extractor/issues).


# Repository

* Web: [https://github.com/ikegami/tts_save_extractor](https://github.com/ikegami/tts_save_extractor)
* git: [https://github.com/ikegami/tts_save_extractor.git](https://github.com/ikegami/tts_save_extractor.git)


# Author

Eric Brine `<ikegami@adaelis.com>`.


# Copyright and License

No rights reserved.

The author has dedicated the work to the Commons by waiving all of his or her rights to the work
worldwide under copyright law and all related or neighboring legal rights he or she had in the work,
to the extent allowable by law.

Works under CC0 do not require attribution. When citing the work, you should not imply endorsement by the author.
