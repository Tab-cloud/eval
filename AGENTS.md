# Eval Web Agent Instructions

## Git publishing

- Use the repository's configured secure SSH-over-443 `origin` for fetch and push: `ssh://git@ssh.github.com:443/Tab-cloud/CD041_LUBAN.git`.
- Publish with native Git commands such as `git fetch origin` and `git push origin <branch>`; GitHub CLI (`gh`) is not required.
- Do not rewrite `origin` to HTTPS or another transport unless the user explicitly requests it.
- Before pushing, verify the intended diff, relevant checks, the current branch, and that the remote branch has not advanced.
- Stage only files that belong to the requested change. Preserve unrelated user work.
