# Kairos-Finance 自托管部署指南（Phase 6）

本文说明正式自托管部署方式。Vercel `api/ocr.js` 仅保留兼容入口，正式运行以 `server.js` 为主。

## 部署边界

- Nginx 保护整站。
- 浏览器不接触 `OCR_ACCESS_TOKEN`。
- Nginx 在反代 `/api/ocr` 时注入内部 `Authorization`。
- Node 在 `NODE_ENV=production` 时始终校验内部访问值。
- `OCR_ACCESS_TOKEN` 缺失、占位或过短时，正式自托管 `server.js` 拒绝启动；兼容入口拒绝 `/api/ocr`。
- 请求缺少或携带错误访问值时，`/api/ocr` 返回 403。
- Node 服务不得直接暴露公网。
- 不新增 PostgreSQL、对象存储或用户系统。

推荐拓扑：

```text
内部浏览器 --HTTPS/整站访问控制--> Nginx --127.0.0.1:3000--> Node server.js
                                            |
                                            +-- /api/ocr 注入内部 Bearer
```

## 环境变量

复制模板：

```bash
cp .env.production.example .env.production
```

至少配置：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
OCR_ACCESS_TOKEN=<在服务器上生成的长随机值>
QWEN_API_KEY=<DashScope API Key>
QWEN_ENDPOINT=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
QWEN_WORKSPACE_ID=<可选：百炼业务空间 ID>
QWEN_WORKSPACE_NAME=<可选：百炼业务空间名称>
QWEN_API_MODE=dashscope-native
QWEN_PRIMARY_MODEL=qwen3-vl-flash
QWEN_FALLBACK_MODEL=qwen3.7-plus
QWEN_HIGH_ACCURACY_MODEL=qwen3-vl-plus
QWEN_ENABLE_THINKING=false
```

当前服务端代码使用 DashScope 原生 `multimodal-generation/generation` 协议，发出的请求体为 `input.messages`。不要把 `QWEN_ENDPOINT` 配成 OpenAI 兼容模式的 `/compatible-mode/v1/chat/completions`，除非同时修改 `api/qwen-client.js` 的请求体结构。

如果百炼控制台创建 API Key 时提供的是工作空间专属 API Host，请使用同一地域、同一工作空间的原生视觉理解地址，例如：

```bash
QWEN_ENDPOINT=https://<WorkspaceId>.<region>.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

配置后可运行安全探针。探针只输出 API Key 是否存在、endpoint 类型、workspaceId、模型名和 API 模式，不输出 API Key 内容：

```bash
npm run check:qwen-config
```

Docker Compose 中容器内使用 `HOST=0.0.0.0`，但端口只绑定到宿主机 `127.0.0.1:3000`，仍不对公网开放 Node。

`OCR_ACCESS_TOKEN` 只作为 Node 运行时环境变量和 Nginx 服务器侧 snippet 使用。不要把真实 Token 写入 HTML、JS、前端构建变量、Docker build args、localStorage、IndexedDB、镜像层、Git 仓库或日志。

## Nginx secret 准备

1. 创建整站访问控制文件：

   ```bash
   sudo htpasswd -c /etc/nginx/secrets/kairos-finance.htpasswd <username>
   ```

2. 创建 OCR 外置内部鉴权片段：

   ```bash
   sudo install -m 0600 -o root -g root /dev/null /etc/nginx/snippets/kairos-finance-ocr-auth.conf
   ```

3. 只在服务器上写入以下内容，并把值替换为与 Node `.env.production` 完全一致的真实值：

   ```nginx
   proxy_set_header Authorization "Bearer <OCR_ACCESS_TOKEN>";
   ```

4. 不要把替换后的 snippet 复制回仓库。

`deploy/nginx-kairos-finance.conf` 中 `/api/ocr` 会覆盖浏览器传来的 `Authorization`，并设置 `X-OCR-Token-Source: nginx`。日志只记录 tokenSource 和鉴权结果，不记录 Token 内容。

正式环境下浏览器不应看到、下载或输入 `OCR_ACCESS_TOKEN`。若需要在本地开发或没有 Nginx 反代的兼容环境中临时输入访问凭证，前端只会保存到 `sessionStorage`；关闭页面或浏览器后失效，不会写入 `localStorage`、IndexedDB 或仓库文件。

## Docker Compose 启动

构建并启动：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
```

查看健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

期望返回：

```json
{"ok":true,"service":"kairos-finance"}
```

该接口不返回 `QWEN_API_KEY`、`OCR_ACCESS_TOKEN` 或模型配置。

## Nginx 启用

1. 将 `deploy/nginx-kairos-finance.conf` 复制到 Nginx `http` 配置范围，例如 `/etc/nginx/conf.d/kairos-finance.conf`。
2. 替换 `server_name` 和证书路径。
3. 确认证书已可用，80 端口只跳转 HTTPS。
4. 检查配置：

   ```bash
   sudo nginx -t
   ```

5. 重载：

   ```bash
   sudo systemctl reload nginx
   ```

示例配置包含：

- HTTPS server。
- `client_max_body_size 15m`。
- `/api/ocr` 的 10 秒连接超时、150 秒读写超时。
- OCR 限流建议：每 IP 每分钟 10 次，突发 5 次。
- `/api/ocr` 内部 Token 注入。
- `/api/health` 代理。

## 验收清单

部署后至少验证：

1. 未通过 Nginx 整站访问控制时不能加载首页。
2. 外部主机无法直连 Node 端口。
3. 直接访问 Node `/api/ocr`，无凭证或错误凭证返回 403。
4. 经 Nginx 上传 JPG/PNG 可以进入识别。
5. 超过 15 MB 的请求被拒绝。
6. `GET /api/health` 不含任何 API Key 或 Token。
7. 日志中搜索不到 base64、`QWEN_API_KEY` 或 `OCR_ACCESS_TOKEN` 的真实值。

## 日志查看

容器日志：

```bash
docker compose logs -f kairos-finance
```

最近 200 行：

```bash
docker compose logs --tail=200 kairos-finance
```

Nginx 日志：

```bash
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

应用日志只应包含 requestId、模型名、耗时、状态、错误类型、tokenSource 和 authResult 等安全字段。

## 升级与回滚

升级：

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/api/health
```

回滚到上一提交：

```bash
git log --oneline -5
git checkout <previous_commit>
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

如果只是新镜像启动失败，可先回到上一份 Git 版本并重建。不要通过关闭 `NODE_ENV=production` 或移除 `OCR_ACCESS_TOKEN` 来恢复服务。

## 故障排查

- 403：检查 Nginx snippet 与 Node `.env.production` 的 `OCR_ACCESS_TOKEN` 是否一致。
- 413：确认 Nginx `client_max_body_size 15m` 与 Node 15 MB 限制一致；压缩图片或拆分上传。
- 502/504：检查容器健康状态、Node 是否监听 3000、`proxy_read_timeout 150s` 是否生效。
- 健康检查失败：运行 `docker compose logs --tail=200 kairos-finance`，确认生产环境 secret 是否缺失。
