// Dockerfile
`FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy project files
COPY . .

# Build client and admin applications
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
RUN npm run build

WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin ./
RUN npm run build

# Return to app root
WORKDIR /app

# Create necessary directories
RUN mkdir -p logs uploads backups

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
`

// docker-compose.yml
`version: '3.8'

services:
  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    depends_on:
      - db
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_SSL=false
      - EMAIL_HOST=${EMAIL_HOST}
      - EMAIL_PORT=${EMAIL_PORT}
      - EMAIL_SECURE=${EMAIL_SECURE}
      - EMAIL_USER=${EMAIL_USER}
      - EMAIL_PASSWORD=${EMAIL_PASSWORD}
      - EMAIL_FROM=${EMAIL_FROM}
      - JWT_SECRET=${JWT_SECRET}
      - SITE_URL=${SITE_URL}
      - DATA_PORTAL_APP_TOKEN=${DATA_PORTAL_APP_TOKEN}
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
      - ./backups:/app/backups

  db:
    image: postgis/postgis:15-3.3
    restart: always
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=${DB_NAME}
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-db:/docker-entrypoint-initdb.d
    command: postgres -c max_connections=200

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/ssl:/etc/nginx/ssl
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    depends_on:
      - app

  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  postgres_data:
`

// nginx/conf.d/default.conf
`server {
    listen 80;
    server_name chicagosafety.org www.chicagosafety.org;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name chicagosafety.org www.chicagosafety.org;
    
    ssl_certificate /etc/letsencrypt/live/chicagosafety.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chicagosafety.org/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name admin.chicagosafety.org;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name admin.chicagosafety.org;
    
    ssl_certificate /etc/letsencrypt/live/admin.chicagosafety.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.chicagosafety.org/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`

// scripts/deploy-lightsail.sh
`#!/bin/bash
# Deploy to AWS Lightsail

# Set variables
INSTANCE_NAME="chicago-safety"
REGION="us-east-1"
SSH_KEY="~/keys/chicagosafety.pem"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "SSH key not found at $SSH_KEY. Please provide the correct path."
    exit 1
fi

# Check if instance exists
INSTANCE_EXISTS=$(aws lightsail get-instance --instance-name "$INSTANCE_NAME" --region "$REGION" 2>&1)
if [[ "$INSTANCE_EXISTS" == *"NotFoundException"* ]]; then
    echo "Instance $INSTANCE_NAME does not exist. Creating..."
    
    # Create instance
    aws lightsail create-instances --instance-names "$INSTANCE_NAME" \
        --availability-zone "${REGION}a" \
        --blueprint-id "ubuntu_20_04" \
        --bundle-id "medium_3_0" \
        --user-data "$(cat ./scripts/user-data.sh)" \
        --region "$REGION"
    
    echo "Instance created. Waiting for it to become available..."
    sleep 60  # Wait for instance to initialize
    
    # Allocate static IP if not already allocated
    STATIC_IP_EXISTS=$(aws lightsail get-static-ip --static-ip-name "${INSTANCE_NAME}-ip" --region "$REGION" 2>&1)
    if [[ "$STATIC_IP_EXISTS" == *"NotFoundException"* ]]; then
        echo "Allocating static IP..."
        aws lightsail allocate-static-ip --static-ip-name "${INSTANCE_NAME}-ip" --region "$REGION"
        aws lightsail attach-static-ip --static-ip-name "${INSTANCE_NAME}-ip" --instance-name "$INSTANCE_NAME" --region "$REGION"
    fi
    
    # Open ports
    echo "Opening ports..."
    aws lightsail open-instance-public-ports \
        --instance-name "$INSTANCE_NAME" \
        --port-info fromPort=80,toPort=80,protocol=TCP \
        --region "$REGION"
    
    aws lightsail open-instance-public-ports \
        --instance-name "$INSTANCE_NAME" \
        --port-info fromPort=443,toPort=443,protocol=TCP \
        --region "$REGION"
    
    # Wait for instance to be ready
    echo "Waiting for instance to be fully ready..."
    sleep 120
fi

# Get instance public IP
INSTANCE_IP=$(aws lightsail get-instance --instance-name "$INSTANCE_NAME" --region "$REGION" --query "instance.publicIpAddress" --output text)
echo "Instance IP: $INSTANCE_IP"

# SSH into instance and set up
echo "Setting up instance..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@$INSTANCE_IP "mkdir -p ~/chicago-safety"

# Copy project files
echo "Copying project files..."
scp -i "$SSH_KEY" -r ./* ubuntu@$INSTANCE_IP:~/chicago-safety/

# Set up Docker and deploy
echo "Deploying application..."
ssh -i "$SSH_KEY" ubuntu@$INSTANCE_IP "cd ~/chicago-safety && bash ./scripts/setup-instance.sh"

echo "Deployment completed successfully!"
echo "Your application should be available at: http://$INSTANCE_IP"
echo "Please set up your DNS records to point to this IP address."
`

// scripts/user-data.sh
`#!/bin/bash

# Update system packages
apt-get update
apt-get upgrade -y

# Install Docker and Docker Compose
apt-get install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
apt-get update
apt-get install -y docker-ce

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.17.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Enable Docker to start on boot
systemctl enable docker
`

// scripts/setup-instance.sh
`#!/bin/bash

# Create required directories
mkdir -p nginx/conf.d
mkdir -p nginx/ssl
mkdir -p certbot/conf
mkdir -p certbot/www
mkdir -p logs
mkdir -p uploads
mkdir -p backups
mkdir -p init-db

# Copy Nginx config
cp nginx/conf.d/default.conf nginx/conf.d/

# Create .env file from template if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file from template. Please edit it with your settings."
    exit 1
fi

# Start the application with Docker Compose
docker-compose up -d

# Initialize SSL certificates with Let's Encrypt
sleep 10  # Wait for services to start
docker-compose run --rm certbot certonly --webroot -w /var/www/certbot -d chicagosafety.org -d www.chicagosafety.org --email admin@chicagosafety.org --agree-tos --no-eff-email
docker-compose run --rm certbot certonly --webroot -w /var/www/certbot -d admin.chicagosafety.org --email admin@chicagosafety.org --agree-tos --no-eff-email

# Reload Nginx to apply SSL certificates
docker-compose exec nginx nginx -s reload

echo "Setup completed!"
echo "The application should now be running with HTTPS enabled."
`

// .env.example
`# Database
DB_NAME=chicago_safety
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Email
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=user@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=Chicago Traffic Safety <noreply@example.com>

# JWT
JWT_SECRET=generate_a_secure_random_string
JWT_EXPIRES_IN=8h

# Site URL
SITE_URL=https://chicagosafety.org

# Chicago Data Portal
DATA_PORTAL_APP_TOKEN=your_chicago_data_portal_token
`

// init-db/00-init-postgis.sql
`-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create admin user for first-time login
INSERT INTO admin_users (email, password_hash, name, created_at, updated_at)
VALUES (
    'admin@chicagosafety.org',
    '$2b$10$X7GzaEHLAV3DkQnJjpJ4U.mXdoGcROdVXYzO5OmZgvDBGCWWLMCaq', -- hash for 'changeme123'
    'System Administrator',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO NOTHING;

-- Display the admin credentials after initialization
\echo 'Database initialized successfully!'
\echo 'Initial admin credentials:'
\echo 'Email: admin@chicagosafety.org'
\echo 'Password: changeme123'
\echo ''
\echo 'IMPORTANT: Please change the admin password after first login!'
`

// package.json (root)
`{
  "name": "chicago-traffic-safety",
  "version": "1.0.0",
  "description": "Chicago Traffic Safety Dashboard",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest",
    "lint": "eslint .",
    "db:setup": "node src/scripts/setupDatabase.js",
    "client:dev": "cd client && npm start",
    "admin:dev": "cd admin && npm start",
    "dev:all": "concurrently \"npm run dev\" \"npm run client:dev\" \"npm run admin:dev\"",
    "build:client": "cd client && npm run build",
    "build:admin": "cd admin && npm run build",
    "build": "npm run build:client && npm run build:admin",
    "postinstall": "cd client && npm install && cd ../admin && npm install"
  },
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@turf/turf": "^6.5.0",
    "axios": "^1.5.0",
    "bcrypt": "^5.1.1",
    "canvas": "^2.11.2",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "d3": "^7.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.0.0",
    "helmet": "^7.0.0",
    "jsonwebtoken": "^9.0.2",
    "luxon": "^3.4.3",
    "mjml": "^4.14.1",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.1",
    "node-cron": "^3.0.2",
    "nodemailer": "^6.9.5",
    "pg": "^8.11.3",
    "pg-format": "^1.0.4",
    "shapefile": "^0.6.6",
    "winston": "^3.10.0"
  },
  "devDependencies": {
    "concurrently": "^8.2.1",
    "eslint": "^8.49.0",
    "jest": "^29.7.0",
    "nodemon": "^3.0.1",
    "supertest": "^6.3.3"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
`