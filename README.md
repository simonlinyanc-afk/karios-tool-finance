# Yellow Bird Finance - Deployment Guide

## Project Structure

```
yellow-bird-finance/
├── index.html          # Main application
├── logo_text.png       # PDF logo (left)
├── logo_graph.png      # PDF logo (right)
├── api/
│   └── ocr.js         # Serverless OCR proxy
├── package.json       # NPM config
├── .env               # Environment variables (local only)
└── .gitignore         # Git ignore file
```

## Deployment to Vercel

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy

```bash
cd /path/to/yellow-bird-finance
vercel
```

Follow the prompts:

- Set up and deploy? **Y**
- Which scope? *Select your account*
- Link to existing project? **N**
- Project name? **yellow-bird-finance**
- Which directory? **./**  (current directory)
- Override settings? **N**

### Step 4: Add Environment Variable

After deployment, add your API key:

```bash
vercel env add QWEN_API_KEY
```

Paste your key: `sk-dc07a675ed8e4c5792633e9a5dfc5a79`

Select environments:

- Production: **Y**
- Preview: **Y**
- Development: **Y**

### Step 5: Redeploy

```bash
vercel --prod
```

## Local Development

### Run locally with Vercel Dev

```bash
vercel dev
```

This will:

- Start local server on <http://localhost:3000>
- Simulate serverless functions
- Load .env variables

### Access the app

Open <http://localhost:3000> in your browser

## Environment Variables

**Required:**

- `QWEN_API_KEY` - Your Qwen/DashScope API key

**Set in Vercel Dashboard:**

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add `QWEN_API_KEY` with your key
4. Select all environments

## Alternative: Netlify Deployment

For Netlify, the API function works the same:

1. Create `netlify.toml`:

```toml
[build]
  publish = "."
  
[functions]
  directory = "api"
```

1. Deploy via Netlify CLI or GitHub

2. Add environment variable in Netlify dashboard

## Security Notes

✅ API key is **server-side only** (not exposed to client)  
✅ `.env` is git-ignored  
✅ API proxy adds a security layer  

## Troubleshooting

**Issue: OCR not working**

- Check environment variable is set in Vercel
- Verify API key is valid
- Check Vercel function logs

**Issue: Images not loading**

- Ensure logo files are in root directory
- Check file permissions

**Issue: CORS errors**

- Serverless function handles CORS automatically
- No additional configuration needed
