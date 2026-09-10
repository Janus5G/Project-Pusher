# Project Pusher

Project Pusher is a desktop tool for preparing a local project and pushing it to GitHub with a guided security-oriented workflow.

## Download

Use the latest GitHub Release:

- **Windows 64-bit:** download `Project-Pusher-Setup-<version>-x64.exe`, run the installer, then open **Project Pusher** from the Start menu.
- **Debian / Ubuntu / Linux Mint 64-bit:** download `Project-Pusher-<version>-x86_64.deb` (the exact architecture label can vary by builder version) and install it with your normal package installer, or with `sudo apt install ./Project-Pusher-*.deb`.

Normal users do **not** need Node.js or npm.

The Windows package includes a minimal Git for Windows runtime used only by Project Pusher. The Debian package declares `git` as a package dependency.

## What Project Pusher does

Project Pusher can:

- select a local project folder;
- inspect the project tree;
- generate common repository files without silently overwriting existing files;
- run selected project checks;
- initialize Git when needed;
- validate the GitHub remote;
- stage and commit changes;
- push over HTTPS using a fine-grained GitHub personal access token.

The token is used for the current push operation and is not intentionally persisted by Project Pusher.

## GitHub token

Create a **fine-grained personal access token** with access only to the repository you want to push to and only the permissions Project Pusher needs.

Do not put a token in the repository URL, source files, README, shell history, screenshots, or committed configuration files.

## Existing repositories

Project Pusher does not automatically replace an existing, different `origin` remote. Existing project files are not silently overwritten by the file generator.

## Release integrity

Every tagged release built by this repository includes `SHA256SUMS.txt`. You can compare the SHA-256 of the downloaded installer/package with that file before installation.

Windows builds also verify the pinned MinGit archive against its expected SHA-256 during GitHub Actions before packaging.

## Build from source

This section is for developers, not normal users.

Requirements:

- Node.js 22.12 or newer
- npm
- Git

Install and run:

```text
npm install
npm start
```

Build Windows installer:

```text
npm run dist:win
```

Build Debian package on Linux:

```text
npm run dist:linux
```

## Creating a release

1. First run **Actions → Build and release installers → Run workflow** to test that both builds complete.
2. When both artifacts are green, create and push a version tag such as `v1.2.0`.
3. GitHub Actions builds the Windows `.exe` and Linux `.deb`, creates `SHA256SUMS.txt`, and publishes them to the GitHub Release automatically.

## Windows code signing

The generated Windows installer is not Authenticode-signed unless a code-signing certificate is configured for the repository build. Windows may therefore show a SmartScreen warning. SHA-256 checksums verify file integrity, but they are not a substitute for publisher code signing.

## License

Project Pusher is released under the MIT License.

The Windows installer bundles MinGit from Git for Windows. See `THIRD_PARTY_NOTICES.md` for third-party licensing information.
