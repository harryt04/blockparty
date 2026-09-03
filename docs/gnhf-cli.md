# gnhf commands

[gnhf](https://github.com/kunchenguid/gnhf) runs an autonomous loop. Each
iteration makes one small committed change toward the objective. This document
holds the exact commands for this repository.

The loop prompt is [gnhf-prompt.md](gnhf-prompt.md). The work queue is
[build-backlog.md](delivery/build-backlog.md). See [MILE-011](delivery/roadmap.md)
for the delivery policy this implements.

## One-time setup

gnhf needs a clean working tree and a branch that is not `master`.

```bash
git checkout -b build/mvp && git push -u origin build/mvp
```

## The build loop

```bash
gnhf "/Users/harry/Documents/git/blockparty/docs/gnhf-prompt.md" \
--agent codex \
--stop-when 'docs/delivery/build-backlog.md has every ticket in Loops 0-F marked [x], [!], or [?]' \
--current-branch --push \
--max-iterations 40 \
--max-tokens 5000000
```

Substitute `--agent claude` to run the same loop under Claude Code.

## Why `--current-branch` and not `--worktree`

The backlog is a dependency chain. Ticket A2 builds on the effect queue that A1
created; B5 builds on the engine seam; every Loop C ticket builds on the sync
client. A worktree gives each iteration its own working directory, so iteration
two cannot see iteration one's code and the chain stalls after the first ticket.

`--current-branch --push` keeps every iteration on one branch and pushes after
each success. `master` stays clean. Review the whole run as one pull request.

## Run length

62 tickets at one ticket per iteration needs roughly two runs at
`--max-iterations 40`. gnhf resumes on the same branch, so a second invocation of
the same command continues the existing history and iteration numbering. It does
not start over.

## While it runs

- Live status sits in the terminal title: iteration, token total, commit count.
- `.gnhf/runs/<runId>/notes.md` carries what each iteration told the next one.
- `.gnhf/runs/<runId>/gnhf.log` is the JSONL debug log. Attach a snippet of it to
  any bug report.
- The first `Ctrl+C` requests a graceful stop and lets the current iteration
  finish. The second stops immediately.
- gnhf waits out an exhausted usage window rather than running through it, then
  retries the same iteration.

## After it stops

```bash
cd /Users/harry/Documents/git/blockparty && git log --oneline master..build/mvp
```

Read the backlog first, not the diff. Three marks need your attention:

| Mark                     | What to do                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `[?]`                    | Review it. Content provenance and brand decisions need a human approver.                                                            |
| `[!]`                    | Read the two-line reason. A blocked ticket is a planning signal: narrow the ticket or correct its acceptance line before rerunning. |
| **Observed, not queued** | Entries an iteration noticed but was forbidden to act on. Promote one to a ticket only if you want it built.                        |

A failed run is diagnostic, not disposable. Preserve the log and the branch, find
out why the ticket could not land, and fix the ticket rather than retrying the
same command unchanged.

## What gnhf must never decide

Content provenance sign-off, the currency display name, public launch, and legal
judgement stay with the project owner. The prompt tells each iteration to draft
and flag these rather than resolve them. Do not remove that section.
