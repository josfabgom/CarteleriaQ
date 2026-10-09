FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# Sincroniza el esquema con la base antes de arrancar (el proyecto aún no usa migraciones)
CMD ["sh", "-c", "npx prisma db push && npm run start"]
