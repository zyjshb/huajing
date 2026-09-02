# 镜场

无限画布短剧工坊。把剧本贴进去，拆镜头、备资产、合成提示词，再出分镜和视频。

[![Node](https://img.shields.io/badge/Node-18+-3c873a?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-6aa3ff)](./LICENSE)

---

## 能做什么

- **无限画布**：剧本、脚本生成器、分镜、视频、配音都是节点，连线即参考
- **每次进来都是空白画布**，以前的项目在 **历史画布** 里接着做
- **大模型**可换：DeepSeek V4 Flash / Pro，或自己填模型 ID（中转站名字原样贴）
- **出图**走本机 Comfy 或云端 API；**出视频**默认 MiniMax H3（6 秒）
- **配音**可本机 GPT-SoVITS / IndexTTS，或云端仿声

> 角色、场景、道具、关键帧请自己用 Flux / ChatGPT 出图后上传。仓库不代出素材图。

---

## 快速开始（Windows）

1. 安装 [Node.js LTS](https://nodejs.org/)
2. 解压或 clone 本仓库
3. 双击 **`启动镜场.bat`**  
   第一次会自动 `npm install`，然后打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)

| 文件 | 作用 |
|---|---|
| `启动镜场.bat` | 只开画布（Web `5173` + API `8787`） |
| `关闭镜场.bat` | 关掉画布服务 |
| `连接云端.bat` | SSH 隧道，把云端 Comfy 映射到本机 `8188` |
| `关闭云端.bat` | 只关隧道，不动画布 |

画布和隧道是分开的，不要绑在一起。

本机开发也可以：

```bash
npm install
npm run dev
```

---

## 怎么用

1. 打开后是空白画布，点 **从一份剧本开始**，或把 `.txt` 拖进画布
2. 从剧本节点右边的 **+** 拉出 **脚本生成器**
3. 三步走：**确认镜头 → 准备资产 → 合成提示词**，再批量出分镜 / 视频 / 配音
4. 左上角 **新建画布** 回到空白页，上一份自动进 **历史画布**
5. **设置**里填 API Key、换模型、填 Comfy 地址（隧道一般是 `http://127.0.0.1:8188`）

### 换大模型

顶部下拉可选 DeepSeek V4 Flash / Pro。自定义：选「自定义模型 ID…」，选服务商，把模型 ID 贴进去（官网是 `deepseek-v4-flash` / `deepseek-v4-pro`；中转站叫别的名字就填他们给的那串）。

### 连云端 Comfy

1. 机器上先开好 Comfy（AutoDL 常见端口 **6006**）
2. 双击 `连接云端.bat`，可粘贴整行 `ssh -p 端口 root@主机`，再输入密码
3. 连上后不要关那个窗口
4. 画布设置里地址填 `http://127.0.0.1:8188`

没有云端、本机自己开 Comfy 也可以，不必走隧道。

---

## 目录

```
huajing/
├── 启动镜场.bat / .ps1
├── 连接云端.bat / .ps1
├── src/                 画布前端
├── server/              本地 API
├── workflows/           Comfy 工作流模板
└── data/                运行后生成（画布、密钥、上传），不进 Git
```

`data/` 只存在你自己电脑上，**不要把 API Key 提交进仓库**。

---

## 许可

MIT
