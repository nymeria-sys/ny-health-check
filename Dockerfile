FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install --production

# Copiar código fonte
COPY src ./src

# Comando de inicialização
# Nota: Rodando como root para ter acesso ao socket do Docker
CMD ["npm", "start"]
