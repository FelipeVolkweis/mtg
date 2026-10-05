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

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a GitHub issue with child tickets linked as GitHub sub-issues.

- **Map**: one issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a GitHub issue linked to the map as a sub-issue and labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). If sub-issues are unavailable, add the child to a task list in the map and put `Part of #<map>` at the top of its body.
- **Blocking**: use GitHub's native issue dependencies. Add a blocker with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`; use the blocker's numeric database `id`, not its issue number or node ID. If native dependencies are unavailable, write `Blocked by: #<number>` in the child body. A ticket is unblocked when every blocker is closed.
- **Frontier**: scan the map's open child issues, then exclude issues with an open blocker or assignee; first in map order wins.
- **Claim**: assign the issue with `gh issue edit <number> --add-assignee @me` before working on it.
- **Resolve**: add the answer with `gh issue comment <number> --body "..."`, close the issue, then add a context pointer to the map's Decisions-so-far.
