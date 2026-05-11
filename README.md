# LaterMe

> 收藏时留一句话，让收藏夹重新活过来

LaterMe 是一个浏览器扩展，在收藏网页的瞬间让你给未来的自己留一句话。它不帮你"收藏更多"，而是帮你"重新打开"。

## 功能

- **收藏备注** — 按 Ctrl+D 收藏时弹出窗口，让你写一句备注（最多50字）
- **书签增强** — 在浏览器书签管理器中显示备注信息
- **智能提醒** — 定期在新标签页展示被遗忘的旧收藏

## 安装

### 开发模式

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式开发
npm run dev
```

### 在 Chrome 中加载

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/` 目录

### 在 Edge 中加载

1. 打开 `edge://extensions/`
2. 开启「开发人员模式」
3. 点击「加载解压缩的扩展」
4. 选择 `dist/` 目录

## 使用方式

### 收藏网页

1. 按 `Ctrl+D`（Mac 上 `Cmd+D`）或点击工具栏图标
2. 在弹出的窗口中输入备注（可选选择用途）
3. 点击「保存」完成收藏

### 查看备注

打开浏览器书签管理器（`chrome://bookmarks/`），每个有备注的书签下方会显示备注信息。

### 重新发现旧收藏

打开新标签页时，可能会看到底部出现提醒横幅，展示被遗忘的旧收藏。

## 技术栈

- Manifest V3
- TypeScript
- Vite + @crxjs/vite-plugin
- IndexedDB（本地存储，无后端）

## 目录结构

```
laterme/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── background/        # Service Worker
│   │   ├── index.ts       # 主入口 & 消息路由
│   │   ├── bookmark.ts    # 书签监听
│   │   ├── resurfacing.ts # 重新提醒逻辑
│   │   └── alarm.ts       # 定时任务
│   ├── content/           # 内容脚本
│   │   ├── capture.ts     # Ctrl+D 拦截
│   │   ├── bookmarkManager.ts  # 书签管理器增强
│   │   ├── newTab.ts      # 新标签页横幅
│   │   └── popup/         # 备注弹窗
│   ├── storage/           # 数据层
│   │   ├── db.ts          # IndexedDB 封装
│   │   └── types.ts       # 类型定义
│   ├── utils/
│   │   ├── browser.ts     # 跨浏览器 API
│   │   └── matcher.ts     # 评分算法
│   ├── options/           # 设置页
│   └── styles/
│       ├── bookmarkManager.css
│       └── resurfacing.css
├── public/
│   └── icons/
└── scripts/
    └── generate-icons.html
```

## 打包提交

```bash
# 构建并打包为 zip
npm run zip
```

生成的 `laterme.zip` 可以直接提交到 Chrome Web Store 或 Edge Add-ons。

## 隐私

- 所有数据存储在用户设备的 IndexedDB 中
- 不上传任何数据到远程服务器
- 不需要任何 AI/LLM API
- 卸载后浏览器原生书签不受影响

## 许可

MIT
