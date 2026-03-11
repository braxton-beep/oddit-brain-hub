FROM mcr.microsoft.com/playwright:v1.42.0-jammy

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

COPY src/ ./src/

# Data dir for cookies + debug screenshots
RUN mkdir -p data

EXPOSE 3001

CMD ["node", "src/index.js"]
