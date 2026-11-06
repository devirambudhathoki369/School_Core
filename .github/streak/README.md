# A commit every day

`.github/workflows/daily-commit.yml` makes one commit on `main` every day,
as devirambudhathoki369, dated that day, with no laptop needed. It runs on
GitHub at 10:15 Nepal time, and again at 16:15 in case a run was dropped.
A day that already has a commit is left alone.

- First it takes the patches in `queue/`, one a day. Each is a real change,
  made and tested before it was queued, and the patch file goes away in the
  same commit.
- When the queue is empty, each day adds a line to `log.md`.
- To stop it: Actions → Daily commit → Disable workflow, or delete the
  workflow file.
- To try it: Actions → Daily commit → Run workflow. That is a dry run unless
  "Apply the next change without pushing it" is unticked.
