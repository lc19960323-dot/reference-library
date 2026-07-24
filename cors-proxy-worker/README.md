# CORS Proxy Cloudflare Worker 部署指南

## 为什么需要这个？

reference-library 网页app需要从浏览器端搜索Google/Bing/史语所等网站，但这些网站不允许跨域请求（CORS限制）。公共CORS代理（allorigins、corsproxy.io等）经常失效或需要付费。自建Cloudflare Worker代理是免费且最可靠的方案。

## 部署步骤（全部免费）

### 1. 注册Cloudflare账号
- 访问 https://dash.cloudflare.com/sign-up
- 免费注册，无需绑定域名

### 2. 安装wrangler CLI
```bash
npm install -g wrangler
```

### 3. 登录Cloudflare
```bash
wrangler login
```
按提示在浏览器中授权

### 4. 部署Worker
```bash
cd cors-proxy-worker
wrangler deploy
```

部署完成后会输出Worker URL，格式如：
`https://cors-proxy-reference-library.YOUR-SUBDOMAIN.workers.dev`

### 5. 配置reference-library app
打开 `index.html`，搜索 `CORS_PROXY_WORKER_URL`，将默认值替换为你的Worker URL。

## 使用方式

代理接受GET请求，目标URL通过 `?url=` 参数传入：
```
https://your-worker.workers.dev/?url=https://www1.ihp.sinica.edu.tw/...
```

## 安全说明

- 仅允许GET请求
- 禁止访问私有IP（localhost/127.x/10.x/192.168.x等）
- 设置15秒超时
- 每日免费额度100,000次请求（远超个人使用需求）
- 添加标准浏览器User-Agent以避免被目标网站拦截

## 测试

部署后验证：
```bash
curl "https://your-worker.workers.dev/health"
# 应返回 {"status":"ok",...}

curl "https://your-worker.workers.dev/?url=https://www1.ihp.sinica.edu.tw/Publications/LegalHistoryStudy/1088/Article/392"
# 应返回史语所网页HTML
```
