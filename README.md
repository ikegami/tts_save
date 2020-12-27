TTS Save File Tools
===================

`tts_save` is a command-line tool for extracting
components from a Tabletop Simulator save file.

[![Version](https://img.shields.io/npm/v/tts_save.svg)](https://npmjs.org/package/tts_save)
[![License](https://img.shields.io/npm/l/tts_save.svg)](https://github.com/ikegami/tts_save/blob/main/LICENSE)
[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io/)
[![Downloads/month](https://img.shields.io/npm/dm/tts_save.svg)](https://npmjs.org/package/tts_save)

* [Installation](#installation)
* [Synopsis](#synopsis)
* [Usage](#usage)
    * [Command: `help`](#command-help)
    * [Command: `version`](#command-version)
    * [Command: `extract`](#command-extract)
        * [Accuracy, Conflicts and Safety](#accuracy-conflicts-and-safety)
    * [Command: `download`](#command-download)
* [Support](#support)
* [Repository](#repository)
* [Author](#author)
* [Copyright and License](#copyright-and-license)


# Installation

```sh
npm install -g tts_save
```

`npm` is provided by [Node.js](https://nodejs.org/).


# Synopsis

To extract all components of `TS_Save_000.json` into the
`out` subdirectory, use the following command:

```sh
tts_save extract -a -o out TS_Save_000.json
```

This works whether `TS_Save_000.json` is found in the current
directory or in TTS's `Saves` directory.

Once the above command has been executed, you can use the following
command to download the resources referenced by the save file:

```sh
tts_save download -o out
```


# Usage

## Command: `help`

```sh
tts_save (help|-h|--help) [command]
```


## Command: `version`

```sh
tts_save (version|-v|--version)
```


## Command: `extract`

Extract components from a Tabletop Simulator save file.

```sh
tts_save extract (-h|--help)
tts_save extract [options] [--] [TS_Save_000.json]
```

From the specified file, this tool will extract the components
indicated by the provided options. By default, nothing is extracted.

If no file is specified, the tool will read from stdin.

If a file name or relative path is provided, the tool will
first look in the current work directory. If it fails to
find the named file there, it will then look in
Tabletop Simulator's "Saves" folder.


### Options:

* `--output=DIR`, `-o DIR`

    Default: `.`

    The directory into which the extracted components should be placed.
    This directory need not exist. If it does, existing files within
    the directory won't be deleted. They may, however, be overwritten.

* `--all`, `-a`

    A shortcut for `--scripts --xml --linked --notes --unbundle`.
    This is subject to being extended if/when new features are added.

* `--scripts`, `-s`

    Save the Lua script of every object into the `objs`
    subdirectory of the output directory.

    See `--unbundle`.

* `--xml`, `-x`

    Save the UI XML of every object into the `objs`
    subdirectory of the output directory.

    See `--unbundle`.

 * `--linked`, `-l`

     Create a list of all the linked resources (e.g. images and object models).
     This list is saved in `linked_resources.json`, which has the following format:

     ```json
     {
        "resources": [
           {
              "url":  "http://...",
              "type": "image"
           },
           ...
        ]
     }
     ```

     The following are the possible values for `type`:

     * `asset_bundle`
     * `audio`
     * `image`
     * `model`
     * `pdf`

     The format may be extended in future versions of this tool.

* `--notes`, `-n`

    Save the notebook entries into the `notes` subdirectory of the output directory.

* `--unbundle`, `-u`

    When used in conjunction with `--scripts`, included scripts (`#include path`
    and `#include <path>`) and required modules (`require("path")`)
    will be extracted into the `lib` subdirectory of the output directory.

    When used in conjunction with `--xml`, included XML files
    (`<Include src="path"/>`) will be extracted into the same
    directory.


### Accuracy, Conflicts and Safety

The extracted scripts and modules and XML should be byte-for-byte equivalent with the original files,
with the following exceptions:

* Line endings will be normalized for the current platform (CRLF on Windows, LF elsewhere).
* Non-empty files that do not end with a line ending will be given one.

It is possible for multiple objects to have the same GUID. The tool handles this situation
gracefully. Similarly, the tool handles notebook entries with the same title gracefully.

The tool avoids using a few particularly dangerous characters in the names of files it creates.
While this could result in a file that's named differently than the directive used to include it,
you should never encounter this in practice.

On the flip side, you could end up with very oddly-named files in the event of
a maliciously-created save file. The name of files could even contain shell
metacharacters. However, the tool constrains its output to the specified
directory, even when provided a maliciously-crafted save file (e.g. one that
includes a file named `../../etc/passwd`).


## Command: `download`

Download the resources referenced by a Tabletop Simulator save file.

```sh
tts_save download (-h|--help)
tts_save download [options] [--]
```

This command expects `tts_save extract` to have previously been run.
It uses the produced `linked_resources.json` file to determine
which files to download and what names to give those files.

The name of a downloaded file is based on how it's used in TTS
(`image`, `audio`, etc). An attempt is made to provide the file
with the correct extension based on its file type (e.g. `.png`
for PNG images, `.jpg` for JPEG images, etc).

As files are downloaded, `linked_resources.json` is updated to
include the file name associated with the downloaded resources.


### Options:

* `--output=DIR`, `-o DIR`

    Default: `.`

    The directory into which `tts_save extract` placed `linked_resources.json`.
    The downloaded resources will be placed in the `resources` subdirectory
    of this directory.


# Support

You may contact the [author](#author) directly.

Bugs and improvements can be reported using GitHub's issue tracker at
[https://github.com/ikegami/tts_save/issues](https://github.com/ikegami/tts_save/issues).


# Repository

* Web: [https://github.com/ikegami/tts_save](https://github.com/ikegami/tts_save)
* git: [https://github.com/ikegami/tts_save.git](https://github.com/ikegami/tts_save.git)


# Author

Eric Brine `<ikegami@adaelis.com>`.


# Copyright and License

No rights reserved.

The author has dedicated the work to the Commons by waiving all of his or her rights to the work
worldwide under copyright law and all related or neighboring legal rights he or she had in the work,
to the extent allowable by law.

Works under CC0 do not require attribution. When citing the work, you should not imply endorsement by the author.
