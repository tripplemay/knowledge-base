#!/bin/bash
# 初始化知识数据仓（.kbdata.git）——与公开代码仓分离、共用同一工作区。
#
# 为什么要两个仓：AGENTS.md 要求"git 管理全部知识历史、失效不删除"，
# 而代码仓要公开、不能带语料与第三方版权 PDF。同工作区 + 不同 GIT_DIR 即可两全。
#
# 用法：_kb/deploy/init-data-repo.sh        （幂等，已存在则只补 exclude 规则）
set -euo pipefail
KB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_GIT="$KB_ROOT/.kbdata.git"

if [ ! -d "$DATA_GIT" ]; then
  git init --bare "$DATA_GIT" >/dev/null
  echo "已创建数据仓: $DATA_GIT"
else
  echo "数据仓已存在: $DATA_GIT"
fi

# 数据仓只关心语料与知识产物，其余一律忽略（否则 git add 容易误收代码）
cat > "$DATA_GIT/info/exclude" <<'EOF'
/*
!/domains
!/forge
!/_kb
/_kb/*
!/_kb/domains.yaml
EOF

git --git-dir="$DATA_GIT" --work-tree="$KB_ROOT" config core.bare false
git --git-dir="$DATA_GIT" --work-tree="$KB_ROOT" config user.name "KnowledgeBase" 2>/dev/null || true
git --git-dir="$DATA_GIT" --work-tree="$KB_ROOT" config user.email "kb@localhost" 2>/dev/null || true

# 首次提交现有语料（无内容时不报错）
# -f：工作区 .gitignore 是代码仓的规则，正把语料排除在外
git --git-dir="$DATA_GIT" --work-tree="$KB_ROOT" add -f -- domains forge _kb/domains.yaml 2>/dev/null || true
if ! git --git-dir="$DATA_GIT" --work-tree="$KB_ROOT" diff --cached --quiet 2>/dev/null; then
  git --git-dir="$DATA_GIT" --work-tree="$KB_ROOT" commit -q -m "data: 知识语料初始快照"
  echo "已提交现有语料"
fi

echo "查看知识历史： git --git-dir=$DATA_GIT --work-tree=$KB_ROOT log --oneline"
