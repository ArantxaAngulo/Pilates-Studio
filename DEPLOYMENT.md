# Deployment Guide - Railway

## 🚀 Quick Deploy to Railway

### Prerequisites
1. [Railway account](https://railway.app)
2. GitHub repository with your code
3. MercadoPago account and API keys
4. MongoDB Atlas account (or Railway MongoDB service)

### Step 1: Prepare Your Repository
```bash
# Ensure all files are committed
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### Step 2: Deploy to Railway

#### Option A: GitHub Integration (Recommended)
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `Pilates-Studio` repository
4. Railway will automatically detect the Dockerfile and deploy

#### Option B: Railway CLI
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

### Step 3: Configure Environment Variables

In Railway Dashboard → Your Project → Variables tab, add:

```env
# CRITICAL - REQUIRED
NODE_ENV=production
JWT_SECRET=your-super-secure-32-char-minimum-secret

# Database (if using Railway MongoDB)
DATABASE_URL=mongodb://mongo:27017/pilates-studio

# MercadoPago
MP_ACCESS_TOKEN=your-production-mercadopago-token
```

### Step 4: Add MongoDB Service (Optional)
1. In Railway Dashboard → Your Project
2. Click "New Service" → "Database" → "MongoDB"
3. Railway will automatically set `DATABASE_URL`

### Step 5: Custom Domain (Optional)
1. In Railway Dashboard → Your Project → Settings
2. Add your custom domain
3. Configure DNS records as shown

---

## 🐳 Local Docker Development

### Build and Run Locally
```bash
# Build Docker image
npm run docker:build

# Run with environment file
npm run docker:run

# Or use docker-compose for full stack
npm run docker:dev
```

### Production Docker
```bash
# Run production setup
npm run docker:prod
```

---

## 📁 Project Structure Changes

### Static Files Migration
- **Before**: `interfaces/` folder served directly
- **After**: `public/` folder for production, `interfaces/` for development
- Server automatically chooses based on `NODE_ENV`

### URL Configuration
- URLs now automatically resolve based on deployment environment
- Railway provides `RAILWAY_PUBLIC_DOMAIN` automatically
- Supports custom domains and development URLs

---

## 🔧 Environment Configuration

### Development
```env
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/pilates-studio
JWT_SECRET=dev-secret-key
NGROK_URL=https://your-ngrok.ngrok-free.app
```

### Production (Railway)
```env
NODE_ENV=production
JWT_SECRET=production-secret-32-chars-minimum
MP_ACCESS_TOKEN=your-production-token
# DATABASE_URL automatically provided by Railway MongoDB
```

---

## 🚨 Security Checklist

### Before Deployment
- [ ] Strong JWT_SECRET (32+ characters)
- [ ] Production MercadoPago tokens
- [ ] No hardcoded secrets in code
- [ ] Rate limiting enabled
- [ ] HTTPS enforced in production
- [ ] Database secured with authentication

### Railway Security
- [ ] Environment variables set in Railway dashboard
- [ ] Secrets not committed to repository
- [ ] Custom domain with SSL (if applicable)
- [ ] MongoDB authentication enabled

---

## 🔍 Monitoring & Health Checks

### Health Check Endpoint
- **URL**: `/api/ping`
- **Purpose**: Railway uses this for health monitoring
- **Response**: `{ message: 'Backend activated' }`

### Logs
```bash
# View Railway logs
railway logs

# Follow logs in real-time
railway logs --follow
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. JWT_SECRET Error
```
Error: JWT_SECRET environment variable is required
```
**Fix**: Set JWT_SECRET in Railway environment variables

#### 2. Database Connection Error
```
MongoDB connection error
```
**Fix**: Ensure DATABASE_URL or MONGODB_URI is set correctly

#### 3. Static Files Not Loading
**Fix**: Ensure `public/` folder contains all frontend files

#### 4. Payment Webhooks Failing
**Fix**: Update MercadoPago webhook URL to Railway domain

### Debug Commands
```bash
# Check environment variables
railway run env

# Test locally with production settings
NODE_ENV=production npm start

# Check Docker build
docker build -t test .
docker run -p 5000:5000 test
```

---

## 📈 Post-Deployment Steps

1. **Test Critical Paths**
   - User registration/login
   - Payment processing
   - Class booking
   - Admin functions

2. **Update MercadoPago Settings**
   - Webhook URL: `https://your-app.railway.app/api/payments/webhook`
   - Success URL: `https://your-app.railway.app/interfaces/success.html`
   - Failure URL: `https://your-app.railway.app/interfaces/failure.html`

3. **Monitor Performance**
   - Check Railway metrics
   - Monitor error logs
   - Test load handling

4. **Backup Strategy**
   - Export database regularly
   - Monitor Railway usage limits
   - Set up alerting

---

## 💡 Optimization Tips

- Use Railway's automatic scaling
- Enable Railway's CDN for static files
- Monitor database performance
- Implement proper logging
- Add error tracking (Sentry, etc.)
- Set up monitoring alerts