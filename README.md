# NY Health Check

Serviço de monitoramento que verifica endpoints periodicamente e reinicia containers Docker automaticamente em caso de falha.

## Características

- Verificação periódica de endpoints HTTP/HTTPS
- Suporte a autenticação Basic e Bearer
- Reinicialização automática de containers Docker
- Configuração via variáveis de ambiente
- Execução no mesmo docker-compose dos containers monitorados

## Instalação

### Local (desenvolvimento)

```bash
npm install
```

### Docker

```bash
docker-compose up -d
```

## Configuração

Crie um arquivo `.env` baseado no `.env.example`:

```bash
cp .env.example .env
```

### Variáveis de Ambiente

| Variável | Obrigatória | Descrição | Exemplo |
|----------|------------|-----------|---------|
| `ENDPOINT_URL` | Sim | URL do endpoint a monitorar | `http://app:80/health` |
| `CHECK_INTERVAL_MS` | Não | Intervalo entre verificações (ms) | `60000` (1 minuto) |
| `AUTH_TYPE` | Não | Tipo de autenticação (`basic`, `bearer` ou vazio) | `bearer` |
| `AUTH_USERNAME` | Condicional | Usuário para autenticação básica | `admin` |
| `AUTH_PASSWORD` | Condicional | Senha para autenticação básica | `secret` |
| `AUTH_TOKEN` | Condicional | Token para autenticação Bearer | `eyJhbG...` |
| `CONTAINERS_TO_RESTART` | Sim | Containers a reiniciar (separados por vírgula) | `my-app,my-api` |
| `DOCKER_SOCKET_PATH` | Não | Caminho do socket Docker | `/var/run/docker.sock` |

### Exemplos de Configuração

#### Sem Autenticação

```env
ENDPOINT_URL=http://my-app:3000/health
CHECK_INTERVAL_MS=60000
CONTAINERS_TO_RESTART=my-app
```

#### Com Autenticação Basic

```env
ENDPOINT_URL=https://api.example.com/health
CHECK_INTERVAL_MS=30000
AUTH_TYPE=basic
AUTH_USERNAME=admin
AUTH_PASSWORD=my-secure-password
CONTAINERS_TO_RESTART=api-container
```

#### Com Autenticação Bearer

```env
ENDPOINT_URL=https://api.example.com/status
CHECK_INTERVAL_MS=120000
AUTH_TYPE=bearer
AUTH_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CONTAINERS_TO_RESTART=api-service,worker-service
```

## Uso

### Desenvolvimento Local

```bash
npm start
```

### Docker Compose

O serviço pode ser adicionado ao seu `docker-compose.yml` existente:

```yaml
services:
  # Seu serviço existente
  my-app:
    image: my-app:latest
    container_name: my-app
    # ... outras configurações

  # Adicionar o health checker
  health-checker:
    build: ./ny-health-check
    container_name: ny-health-check
    restart: unless-stopped
    environment:
      ENDPOINT_URL: http://my-app:3000/health
      CHECK_INTERVAL_MS: 60000
      CONTAINERS_TO_RESTART: my-app
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      - my-app
```

### Iniciar Serviços

```bash
docker-compose up -d
```

### Ver Logs

```bash
docker-compose logs -f health-checker
```

## Como Funciona

1. O serviço inicia e valida as configurações
2. A cada intervalo definido (padrão: 1 minuto):
   - Faz uma requisição GET ao endpoint configurado
   - Verifica se o status code é 200
   - Se for 200: continua monitorando
   - Se não for 200 ou houver erro: reinicia os containers configurados
3. Os logs mostram cada verificação e ação tomada

## Logs de Exemplo

```
🏥 Health Check Service iniciado
📍 Endpoint: http://my-app:80/health
⏱️  Intervalo: 60000ms
🐳 Containers para reiniciar: my-app

[2024-01-15T10:30:00.000Z] 🔍 Verificando endpoint...
✅ Health check OK - Status: 200

[2024-01-15T10:31:00.000Z] 🔍 Verificando endpoint...
❌ Health check FALHOU - Status: 500
🔄 Iniciando reinicialização dos containers...
🔄 Reiniciando container: my-app
✅ Container 'my-app' reiniciado com sucesso
```

## Segurança

### Permissões Docker

O serviço precisa de acesso ao socket Docker (`/var/run/docker.sock`) para reiniciar containers. Isso é feito através do volume mount:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### Modo Read-Only

O socket é montado em modo read-only (`:ro`), mas o `dockerode` ainda consegue executar operações de gerenciamento de containers através da API Docker.

### Considerações

- Execute apenas em ambientes confiáveis
- Limite o acesso aos containers específicos necessários
- Use autenticação nos endpoints quando possível
- Monitore os logs para detectar comportamentos anômalos

## Troubleshooting

### Container não é encontrado

Certifique-se de que o nome do container em `CONTAINERS_TO_RESTART` corresponde ao nome real do container:

```bash
docker ps --format "{{.Names}}"
```

### Erro de permissão no Docker socket

No Linux, pode ser necessário adicionar o usuário ao grupo docker ou executar com permissões adequadas.

### Health check sempre falha

Verifique se:
- O endpoint está acessível de dentro do container
- A URL está correta (use nomes de serviço do docker-compose, não localhost)
- A autenticação está configurada corretamente
- O endpoint retorna status 200

## Desenvolvimento

### Estrutura do Projeto

```
ny-health-check/
├── src/
│   └── index.js          # Código principal
├── .env.example          # Exemplo de configuração
├── .gitignore
├── docker-compose.yml    # Exemplo de uso
├── Dockerfile
├── package.json
└── README.md
```

### Adicionar Features

O código está estruturado para facilitar extensões:

- `buildRequestOptions()`: Adicionar novos tipos de autenticação
- `performHealthCheck()`: Modificar lógica de verificação
- `restartContainers()`: Adicionar outras ações de recuperação

## Licença

MIT
