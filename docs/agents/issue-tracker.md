# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create an issue with `gh issue create --title "..." --body "..."`; use a heredoc for multi-line bodies.
- Read an issue with `gh issue view <number> --comments`; include labels when checking triage state.
- List issues with `gh issue list --state open --json number,title,body,labels,comments` and filter by label or state as needed.
- Comment with `gh issue comment <number> --body "..."`.
- Apply or remove triage labels with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue with `gh issue close <number> --comment "..."`.

The `gh` CLI infers the repository from `git remote -v` when run in this checkout.

## Pull requests as a request surface

No. Pull requests are not a request surface for triage in this repo.
