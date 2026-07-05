# Kairos-Finance 自托管部署（Phase 3 安全基线）

> 本页先落地已批准的网络与鉴权边界。Dockerfile、Docker Compose、`/api/health`、正式回滚步骤和完整日志查看命令将在 Phase 6 补全并实测。

## 网络拓扑

```text
内部浏览器 --HTTPS/整站访问控制--> Nginx --127.0.0.1:3000--> Node
                                            |
                                            +-- 外置 OCR 鉴权片段
```

Node 使用 `.env.production.example` 为模板，并保持 `HOST=127.0.0.1`。安全组和主机防火墙不得开放 3000 端口；只开放 Nginx 的 443，80 仅用于跳转 HTTPS。Node 服务不得直接暴露公网。

## 服务器 secret 准备

1. 生成两个彼此独立的秘密：整站访问密码和 OCR 内部访问值。
2. 整站密码写入 `/etc/nginx/secrets/yellow-bird-finance.htpasswd`。
3. 在服务器上创建 `/etc/nginx/snippets/yellow-bird-finance-ocr-auth.conf`，权限设为 root:root `0600`。先按以下精确语法创建文件，再只在服务器上把尖括号占位符替换为与 Node 环境相同的真实值：

   ```nginx
   proxy_set_header Authorization "Bearer <OCR_ACCESS_TOKEN>";
   ```

   不要把替换后的文件复制回仓库；尖括号本身也不能保留在正式服务器配置中。
4. 真实值不得写入仓库、镜像层、前端文件、构建变量或操作文档。
5. 将 `deploy/nginx-yellow-bird-finance.conf` 复制到 Nginx 的 `http` 配置范围，替换域名和证书路径后执行 `nginx -t`。

因为外置片段在 `/api/ocr` location 内显式设置 `Authorization`，浏览器即使自行提交同名头，也会被 Nginx 配置覆盖。`X-OCR-Token-Source` 同样被覆盖为 `nginx`，日志不会相信任意客户端提供的其他值。

## Node 环境

至少配置：

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=3000`
- 随机的 `OCR_ACCESS_TOKEN`
- `QWEN_API_KEY`、`QWEN_ENDPOINT` 和三个模型环境变量
- `QWEN_ENABLE_THINKING=false`

生产环境缺少内部访问值时，自托管服务拒绝启动。不要为了临时恢复而改成 `NODE_ENV=development`；应修复 secret 注入后重启。

## 鉴权验收

部署后至少验证：

1. 未通过整站访问控制的浏览器无法加载首页。
2. 绕过 Nginx 的外部主机无法连接 Node 端口。
3. 直接向 Node `/api/ocr` 发送无凭证或错误凭证请求会得到 403。
4. 通过 Nginx 上传受支持图片可以进入识别，并在日志看到 `tokenSource=nginx`、`authResult=allowed`。
5. 超过 15m 的请求被入口拒绝；OCR 超时预算由 150 秒反代超时覆盖。
6. 日志中搜索不到 base64 图片、访问值或上游 API Key。

## 限流与超时

示例以客户端 IP 建立共享限流区，建议从每分钟 10 次、突发 5 次开始，再根据内部并发调整。OCR 路径连接超时 10 秒，发送与读取超时 150 秒，覆盖浏览器现有的 130 秒请求预算。限流不替代整站身份校验。

## Phase 6 待补全项

- Dockerfile 与非 root 运行用户。
- Docker Compose、secret 挂载和健康检查。
- `GET /api/health` 的正式响应与容器健康探针。
- 版本化镜像、升级与回滚命令。
- 日志查看、保留、轮换和故障排查步骤。
- HTTPS 证书自动续期示例与部署回归测试。

在 Phase 6 完成前，本页不宣称 Docker 启动、健康检查或回滚已经验收。
