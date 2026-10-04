#!/bin/sh
# 公開サイト（GitHub Pages の gh-pages ブランチ）を今の public/ で更新する
set -e
cd "$(dirname "$0")/.."
npm run -s build:pages
tmp=$(mktemp -d)
git fetch -q origin gh-pages
git worktree add -q "$tmp" origin/gh-pages
(cd "$tmp" && git checkout -q -B gh-pages && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + && cp -r "$OLDPWD/dist-pages/." . \
  && git add -A && { git diff --cached --quiet && echo "変更なし"; } || git commit -q -m "公開: $(git -C "$OLDPWD" log -1 --format=%s)" && git push -q origin gh-pages)
git worktree remove --force "$tmp"
echo "公開しました: https://yoo15kpr-dotcom.github.io/zubora-kakeibo/"
