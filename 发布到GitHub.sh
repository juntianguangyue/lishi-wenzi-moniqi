#!/usr/bin/env bash
# =============================================
# 一键把《历史文字模拟器》推送到 GitHub Pages
# 使用方法：
#   1. 先到 GitHub 新建一个空的公开仓库；
#   2. 修改下面两行；
#   3. 在本文件所在文件夹执行：bash 发布到GitHub.sh
# =============================================
set -e

GITHUB_USER="你的用户名"
REPO="你的仓库名"

cd "$(dirname "$0")"

if [ ! -f index.html ]; then
  echo "找不到 index.html，请确认脚本放在游戏文件夹内。"
  exit 1
fi

git init -b main 2>/dev/null || git checkout -b main 2>/dev/null || true
git add .
git commit -m "历史文字模拟器：崇祯十七年" || echo "没有新的修改，跳过提交"

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GITHUB_USER}/${REPO}.git"
git branch -M main
git push -u origin main

echo "推送完成！"
echo "接下来进入 GitHub 仓库 Settings -> Pages，选择 main 分支和 / (root)，保存后即可获得网址。"
