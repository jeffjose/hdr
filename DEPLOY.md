# Deployment Guide for Vercel

## Prerequisites
- Vercel account (free tier works)
- Git repository (GitHub, GitLab, or Bitbucket)

## Method 1: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

Follow the prompts to link your project and deploy.

## Method 2: Deploy via GitHub Integration

1. Push your code to GitHub:
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will auto-detect the static site
6. Click "Deploy"

## Method 3: Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Choose "Import Third-Party Git Repository"
4. Enter your repository URL
5. Configure (defaults should work)
6. Click "Deploy"

## Configuration Notes

The project includes:
- `vercel.json` - Configures static hosting with proper headers for CORS
- `package.json` - Basic project metadata

No build step required - this is a static site that runs entirely client-side.

## Post-Deployment

Your site will be available at:
- `https://[project-name].vercel.app`
- Custom domain can be configured in Vercel dashboard

## Environment Variables

None required for this static site.

## Troubleshooting

If images don't load due to CORS:
- The `vercel.json` includes CORS headers
- External images must support CORS or use a proxy