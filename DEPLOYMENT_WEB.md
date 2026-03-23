# Deployment Guide - WYSIWYG Slide Editor

## Overview

The WYSIWYG editor is a **single HTML file** with zero build steps, making it trivial to deploy anywhere.

**Requirements:**
- Any web server (nginx, Apache, Python, Node, etc.)
- No backend needed
- No build tools required
- No special configuration

---

## Quick Deploy (Choose One)

### Option 1: Cloudflare Tunnel (Easiest for Public Access)

```bash
# Install cloudflared CLI
brew install cloudflare/cloudflare/cloudflared  # macOS
# or: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/

# Start tunnel (runs server + exposes publicly)
cloudflared tunnel --url file:///Users/axevoid/.openclaw/workspace/index.html

# Or start a local server first
cd /Users/axevoid/.openclaw/workspace
python3 -m http.server 8000
# In another terminal:
cloudflared tunnel --url http://localhost:8000

# Access at: https://xxxxxx.trycloudflare.com
```

**Pros:** Free, instant public access, no setup  
**Cons:** URL changes on restart

---

### Option 2: GitHub Pages (Free & Permanent)

```bash
# 1. Create gh-pages branch
cd /your/repo
git checkout --orphan gh-pages
git rm -rf .

# 2. Copy editor files
cp /Users/axevoid/.openclaw/workspace/index.html .
cp /Users/axevoid/.openclaw/workspace/README.md .
cp /Users/axevoid/.openclaw/workspace/QUICKSTART.md .

# 3. Create index at root
echo '<meta http-equiv="refresh" content="0;url=index.html">' > index.html

# 4. Push
git add .
git commit -m "Add WYSIWYG editor"
git push origin gh-pages

# 5. Enable in GitHub repo settings:
# Settings > Pages > Source: gh-pages branch

# Access at: https://username.github.io/
```

**Pros:** Free, permanent, version controlled  
**Cons:** 5-minute build time

---

### Option 3: Vercel (Next.js Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Create project directory
mkdir slide-editor && cd slide-editor
cp /Users/axevoid/.openclaw/workspace/index.html .

# Deploy
vercel

# Follow prompts and access: https://slide-editor.vercel.app
```

**Pros:** Fast, auto-scaling, free tier  
**Cons:** Requires Node.js

---

### Option 4: Netlify (Simple & Fast)

```bash
# Install Netlify CLI
npm install -g netlify-cli
# or: brew install netlify-cli

# Create project
mkdir slide-editor && cd slide-editor
cp /Users/axevoid/.openclaw/workspace/index.html .

# Deploy
netlify deploy --prod --dir . --functions=functions

# Access: https://slide-editor-xxx.netlify.app
```

**Pros:** Simple, fast builds, free HTTPS  
**Cons:** Requires npm

---

### Option 5: Self-Hosted Server (nginx)

```bash
# Copy file to server
scp index.html user@server.com:/var/www/html/

# nginx config
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}

# Reload nginx
sudo systemctl reload nginx

# Access: https://yourdomain.com/index.html
```

**Pros:** Full control, cheap hosting  
**Cons:** Manual setup and maintenance

---

### Option 6: Self-Hosted Server (Apache)

```bash
# Copy file
scp index.html user@server.com:/var/www/html/

# Enable modules
a2enmod rewrite

# .htaccess in /var/www/html/
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ index.html [QSA,L]
</IfModule>

# Reload Apache
sudo systemctl reload apache2

# Access: https://yourdomain.com/index.html
```

**Pros:** Standard web server, wide compatibility  
**Cons:** More configuration than nginx

---

### Option 7: Docker Container

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY index.html .
EXPOSE 3000
CMD ["npx", "http-server", "-p", "3000"]
```

```bash
# Build & run
docker build -t slide-editor .
docker run -p 3000:3000 slide-editor

# Access: http://localhost:3000
```

---

### Option 8: AWS S3 + CloudFront

```bash
# Upload to S3
aws s3 cp index.html s3://my-slides-bucket/

# Set public permissions
aws s3api put-object-acl --bucket my-slides-bucket --key index.html --acl public-read

# Create CloudFront distribution (via AWS Console)
# Origin: S3 bucket
# Default root: index.html

# Access: https://d123.cloudfront.net/index.html
```

**Pros:** Highly available, auto-scaling, cheap  
**Cons:** Requires AWS account

---

## Environment Variables & Configuration

The editor runs entirely in the browser with no server-side code needed.

### Available localStorage Keys
- `slide-state` - Stores current slide data

### Configuration via JavaScript (Optional)

Edit these variables in the script:
```javascript
const GRID = 20;  // Grid size (pixels)
const CANVAS_WIDTH = 1200;  // Canvas width
const CANVAS_HEIGHT = 800;  // Canvas height
```

---

## CORS & Security

**CORS:** Not needed (all client-side)  
**Security:** No backend exposure, safe from injection  
**HTTPS:** Recommended for production

---

## Performance Optimization

### Serve with gzip compression
```nginx
gzip on;
gzip_types text/html text/css text/javascript;
gzip_comp_level 9;
```

### Cache HTML file
```nginx
expires 1d;
add_header Cache-Control "public, max-age=86400";
```

### Cache-busting (if updating)
Rename file: `index-v2.html` or `index.min.html`

---

## Monitoring & Analytics (Optional)

Add Google Analytics (optional):
```html
<!-- Add to <head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## Domain Configuration

### Custom Domain (Cloudflare)
1. Add domain to Cloudflare
2. Update DNS nameservers
3. Create CNAME for subdomain:
   - `editor.yourdomain.com` → `xxxxxx.trycloudflare.com`

### Custom Domain (GitHub Pages)
1. Add `CNAME` file with domain name
2. Update DNS CNAME record
3. Enable HTTPS in repo settings

### Custom Domain (Vercel)
```bash
vercel alias set slide-editor yourdomain.com
# Update DNS CNAME: yourdomain.com -> cname.vercel-dns.com
```

---

## Backup & Versioning

### Version Control
```bash
git init
git add index.html README.md QUICKSTART.md
git commit -m "v1.0.0 - Initial release"
git tag v1.0.0
git push --all --tags
```

### Backup Strategy
1. Export slides as JSON regularly
2. Keep index.html in git history
3. Use GitHub releases for versions

---

## Troubleshooting

### "MIME type must be text/javascript"
- Server not serving `.html` correctly
- Check Content-Type headers
- Use proper web server (not file://)

### localStorage not persisting
- Browser in private/incognito mode
- localStorage disabled in settings
- Different domain/protocol (http vs https)

### React not loading
- Check CDN URLs are accessible
- Disable ad blockers (may block CDN)
- Check browser console for errors

### Files not updating after deploy
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Check deploy logs

---

## Scaling & Load Testing

The editor is client-side only, so:
- No database scaling needed
- No API rate limits
- Unlimited concurrent users
- Minimal bandwidth (~30KB per user)

For 1,000 concurrent users:
- Bandwidth: ~30MB
- Server resources: Minimal (static file serving)
- Load balancer: Optional

---

## Upgrade Path

To update to a new version:
1. Update `index.html` file
2. Deploy to your hosting
3. Users refresh browser to get new version
4. No forced updates (no backend control)

---

## Compliance & Privacy

### GDPR Compliance
- ✅ No user data collection
- ✅ No server-side storage
- ✅ No cookies or tracking (unless you add)
- ✅ All data stays on user's device

### Data Privacy
- Slides stored only in browser localStorage
- Exported JSON files stay on user's device
- No analytics or telemetry (by default)

---

## Support

For deployment issues:
1. Check server error logs
2. Verify file permissions (644 for HTML)
3. Test with simple HTTP server first
4. Check browser console (F12)
5. Review server access logs

---

## Quick Reference

| Hosting | Cost | Setup Time | Best For |
|---------|------|-----------|----------|
| Cloudflare Tunnel | Free | 2 min | Testing, demos |
| GitHub Pages | Free | 5 min | Personal projects |
| Vercel | Free | 2 min | Modern hosting |
| Netlify | Free | 2 min | Simplicity |
| AWS S3 | ~$1-5/mo | 15 min | Scalability |
| Self-hosted | ~$5/mo | 30 min | Full control |
| Heroku | Free | 5 min | Hobby projects |
| Railway | Free | 5 min | Hobby projects |

---

**Last Updated**: March 23, 2026  
**Status**: Production Ready ✅
