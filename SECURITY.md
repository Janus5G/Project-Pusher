# Security Policy

## Reporting a security issue

Please do not publish access tokens, credentials, private repository contents, or exploit details in a public issue.

For a suspected security problem, provide the smallest reproducible description possible and remove secrets before sharing logs or screenshots.

## Token handling

Project Pusher is designed to use a fine-grained GitHub token only for the active push operation. Tokens must never be embedded in repository URLs or committed files.

## Release verification

Official tagged releases include SHA-256 checksums. Windows builds verify the pinned MinGit archive before packaging.

## Supported release

Security fixes should target the latest Project Pusher release.
