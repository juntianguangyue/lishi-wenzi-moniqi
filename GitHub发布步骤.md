# 把游戏发布到 GitHub Pages（详细步骤）

目标：让别人通过 `https://你的用户名.github.io/仓库名/` 玩到这个游戏。

---

## 方法一：完全不用命令行（适合新手）

### 1. 注册并新建仓库
1. 打开 https://github.com ，注册并登录；
2. 点右上角 `+`，选择 `New repository`；
3. Repository name 填：`lishi-wenzi-moniqi`（可自定，建议英文或拼音）；
4. 选择 `Public`（公开仓库）；
5. 不要勾选任何初始化选项，点 `Create repository`。

### 2. 上传游戏文件
1. 进入刚创建的仓库页面；
2. 点 `uploading an existing file`；
3. 把下面这些文件拖进上传区域（文件在 `历史文字模拟器` 文件夹里）：
   - `index.html`
   - `style.css`
   - `data.js`
   - `game.js`
   - `README.md`
   - `部署说明.md`
4. 底部点 `Commit changes`。

> 也可以把整个文件夹里的文件先全选再拖入。

### 3. 开启 GitHub Pages
1. 进入仓库，点 `Settings`；
2. 左侧菜单点 `Pages`；
3. `Source` 选择 `Deploy from a branch`；
4. `Branch` 选择 `main`，目录选择 `/ (root)`；
5. 点 `Save`；
6. 等待约 1～2 分钟，页面会显示网址：
   ```
   https://你的用户名.github.io/lishi-wenzi-moniqi/
   ```

---

## 方法二：用命令行 Git（更快，适合后续更新）

在 `历史文字模拟器` 文件夹所在终端执行：

```bash
cd 历史文字模拟器

git init -b main
git add .
git commit -m "历史文字模拟器：崇祯十七年"
```

然后到 GitHub 新建一个**空的**公开仓库，再执行：

```bash
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

最后按“方法一”的第 3 步开启 GitHub Pages 即可。

---

## 更新游戏的方法

以后修改了 `data.js` 或 `game.js`，重新执行：

```bash
cd 历史文字模拟器
git add .
git commit -m "更新游戏内容"
git push
```

GitHub Pages 会在约 1 分钟后自动更新。

---

## 注意事项

- GitHub Pages 自带 HTTPS，所以游戏里的人声朗读可以正常使用；
- 如果上传后打开只看到文件列表，说明 Pages 还没开启，或目录没选 `/ (root)`；
- 手机端也可打开同一个网址；
- 如果国内访问 GitHub Pages 较慢，可把同一仓库导入 Gitee 并开启 Gitee Pages。
