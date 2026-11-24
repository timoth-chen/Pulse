FROM node:24-alpine
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-eng
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p data
EXPOSE 8080
CMD ["node", "server.js"]
