require('dotenv').config();
const axios = require('axios');
const Docker = require('dockerode');
const os = require('os');

// Configurações
const ENDPOINT_URL = process.env.ENDPOINT_URL;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS || '60000'); // 1 minuto por padrão
const MAX_FAILURES_BEFORE_RESTART = parseInt(process.env.MAX_FAILURES_BEFORE_RESTART || '3'); // 3 falhas por padrão
const AUTH_TYPE = process.env.AUTH_TYPE; // 'basic', 'bearer', ou vazio
const AUTH_USERNAME = process.env.AUTH_USERNAME;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const CONTAINERS_TO_RESTART = process.env.CONTAINERS_TO_RESTART?.split(',').map(c => c.trim()) || [];

// Contador de falhas consecutivas
let consecutiveFailures = 0;

// Detectar socket do Docker baseado na plataforma
function getDockerSocketPath() {
  if (process.env.DOCKER_SOCKET_PATH) {
    return process.env.DOCKER_SOCKET_PATH;
  }

  // Windows usa named pipe
  if (os.platform() === 'win32') {
    return '//./pipe/docker_engine';
  }

  // Linux/Mac usa socket Unix
  return '/var/run/docker.sock';
}

const DOCKER_SOCKET_PATH = getDockerSocketPath();

// Inicializar Docker cliente
const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

console.log('🏥 Health Check Service iniciado');
console.log(`💻 Plataforma: ${os.platform()}`);
console.log(`🔌 Docker Socket: ${DOCKER_SOCKET_PATH}`);
console.log(`📍 Endpoint: ${ENDPOINT_URL}`);
console.log(`⏱️  Intervalo: ${CHECK_INTERVAL}ms`);
console.log(`⚠️  Falhas antes de reiniciar: ${MAX_FAILURES_BEFORE_RESTART}`);
console.log(`🐳 Containers para reiniciar: ${CONTAINERS_TO_RESTART.join(', ')}`);

/**
 * Constrói as opções de requisição com autenticação
 */
function buildRequestOptions() {
  const options = {
    method: 'GET',
    url: ENDPOINT_URL,
    timeout: 10000,
    validateStatus: function (status) {
      return status === 200; // Apenas 200 é considerado sucesso
    }
  };

  // Adicionar autenticação se configurada
  if (AUTH_TYPE === 'basic' && AUTH_USERNAME && AUTH_PASSWORD) {
    options.auth = {
      username: AUTH_USERNAME,
      password: AUTH_PASSWORD
    };
    console.log('🔐 Usando autenticação Basic');
  } else if (AUTH_TYPE === 'bearer' && AUTH_TOKEN) {
    options.headers = {
      'Authorization': `Bearer ${AUTH_TOKEN}`
    };
    console.log('🔐 Usando autenticação Bearer');
  }

  return options;
}

/**
 * Reinicia os containers configurados
 */
async function restartContainers() {
  console.log('🔄 Iniciando reinicialização dos containers...');

  for (const containerName of CONTAINERS_TO_RESTART) {
    try {
      // Buscar container por nome
      const containers = await docker.listContainers({ all: true });
      const containerInfo = containers.find(c =>
        c.Names.some(name => name === `/${containerName}` || name === containerName)
      );

      if (!containerInfo) {
        console.error(`❌ Container '${containerName}' não encontrado`);
        continue;
      }

      const container = docker.getContainer(containerInfo.Id);

      console.log(`🔄 Reiniciando container: ${containerName}`);
      await container.restart();
      console.log(`✅ Container '${containerName}' reiniciado com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao reiniciar container '${containerName}':`, error.message);
    }
  }
}

/**
 * Realiza o health check do endpoint
 */
async function performHealthCheck() {
  const timestamp = new Date().toISOString();

  try {
    console.log(`\n[${timestamp}] 🔍 Verificando endpoint...`);

    const options = buildRequestOptions();
    const response = await axios(options);

    console.log(`✅ Health check OK - Status: ${response.status}`);

    // Resetar contador de falhas se o health check passou
    if (consecutiveFailures > 0) {
      console.log(`🔄 Resetando contador de falhas (estava em ${consecutiveFailures})`);
      consecutiveFailures = 0;
    }

    return true;
  } catch (error) {
    const statusCode = error.response?.status || 'N/A';
    consecutiveFailures++;

    console.error(`❌ Health check FALHOU - Status: ${statusCode}`);
    console.error(`⚠️  Falhas consecutivas: ${consecutiveFailures}/${MAX_FAILURES_BEFORE_RESTART}`);

    if (error.response) {
      console.error(`   Resposta: ${error.response.statusText}`);
    } else if (error.request) {
      console.error(`   Erro: Sem resposta do servidor`);
    } else {
      console.error(`   Erro: ${error.message}`);
    }

    // Reiniciar containers apenas após atingir o limite de falhas
    if (consecutiveFailures >= MAX_FAILURES_BEFORE_RESTART) {
      console.error(`🚨 Limite de falhas atingido! Reiniciando containers...`);
      await restartContainers();
      consecutiveFailures = 0; // Resetar contador após reiniciar
    } else {
      const remainingFailures = MAX_FAILURES_BEFORE_RESTART - consecutiveFailures;
      console.warn(`⏳ Aguardando mais ${remainingFailures} falha(s) antes de reiniciar`);
    }

    return false;
  }
}

/**
 * Valida as configurações necessárias
 */
function validateConfig() {
  if (!ENDPOINT_URL) {
    console.error('❌ ERRO: ENDPOINT_URL não configurado no .env');
    process.exit(1);
  }

  if (CONTAINERS_TO_RESTART.length === 0) {
    console.warn('⚠️  AVISO: Nenhum container configurado para reiniciar');
  }

  if (AUTH_TYPE === 'basic' && (!AUTH_USERNAME || !AUTH_PASSWORD)) {
    console.error('❌ ERRO: AUTH_TYPE=basic requer AUTH_USERNAME e AUTH_PASSWORD');
    process.exit(1);
  }

  if (AUTH_TYPE === 'bearer' && !AUTH_TOKEN) {
    console.error('❌ ERRO: AUTH_TYPE=bearer requer AUTH_TOKEN');
    process.exit(1);
  }
}

/**
 * Inicializa o serviço
 */
async function init() {
  validateConfig();

  // Executar primeiro health check imediatamente
  await performHealthCheck();

  // Agendar próximas verificações
  setInterval(performHealthCheck, CHECK_INTERVAL);

  console.log(`\n✅ Serviço ativo. Próxima verificação em ${CHECK_INTERVAL / 1000} segundos\n`);
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Erro não tratado:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, encerrando...');
  process.exit(0);
});

// Iniciar serviço
init();
