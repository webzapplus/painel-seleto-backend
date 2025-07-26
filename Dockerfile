# Usa uma imagem oficial do Node.js como base
FROM node:18-slim

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos package.json e package-lock.json
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install

# Copia o resto do código do seu projeto para dentro do container
COPY . .

# Expõe a porta que sua aplicação usa (no seu caso, 3001)
EXPOSE 3001

# Comando para iniciar a aplicação quando o container rodar
CMD [ "node", "index.js" ]