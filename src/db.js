import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let dbInstance = null;

function caminhoDb() {
  return process.env.DB_PATH || 'data/leads.db';
}

function garantirSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id            TEXT PRIMARY KEY,
      segmento      TEXT NOT NULL,
      cidade        TEXT NOT NULL,
      nome          TEXT,
      endereco      TEXT,
      telefone      TEXT,
      site          TEXT,
      wa_link       TEXT,
      score         INTEGER,
      mensagem      TEXT,
      status        TEXT NOT NULL DEFAULT 'coletado',
      criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_segmento_cidade ON leads(segmento, cidade);
  `);
}

/**
 * Retorna a instância (singleton) do banco SQLite, criando o diretório e o
 * schema na primeira chamada.
 */
export function getDb() {
  if (dbInstance) return dbInstance;

  const caminho = caminhoDb();
  mkdirSync(dirname(caminho), { recursive: true });

  dbInstance = new Database(caminho);
  dbInstance.pragma('journal_mode = WAL');
  garantirSchema(dbInstance);

  return dbInstance;
}

/**
 * Insere um lead novo com status "coletado" ou atualiza os dados brutos de
 * um lead já existente (mesmo id do OSM), sem mexer em score/mensagem/status
 * caso ele já tenha sido qualificado antes (evita "voltar" o status de um
 * lead já processado ao rodar collect.js de novo).
 */
export function upsertLeadColetado(lead) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO leads (id, segmento, cidade, nome, endereco, telefone, site, wa_link, status)
    VALUES (@id, @segmento, @cidade, @nome, @endereco, @telefone, @site, @wa_link, 'coletado')
    ON CONFLICT(id) DO UPDATE SET
      nome          = excluded.nome,
      endereco      = excluded.endereco,
      telefone      = excluded.telefone,
      site          = excluded.site,
      wa_link       = excluded.wa_link,
      atualizado_em = datetime('now')
  `);
  stmt.run(lead);
}

/**
 * Busca leads por status, opcionalmente filtrando por segmento e/ou cidade
 * (já esperados normalizados em minúsculo).
 */
export function getLeadsPorStatus(status, { segmento, cidade } = {}) {
  const db = getDb();

  let query = 'SELECT * FROM leads WHERE status = @status';
  const params = { status };

  if (segmento) {
    query += ' AND segmento = @segmento';
    params.segmento = segmento;
  }
  if (cidade) {
    query += ' AND cidade = @cidade';
    params.cidade = cidade;
  }

  return db.prepare(query).all(params);
}

/** Grava o resultado da qualificação (score + mensagem) e avança o status. */
export function atualizarQualificacao(id, { score, mensagem, status = 'qualificado' }) {
  const db = getDb();
  db.prepare(`
    UPDATE leads
    SET score = @score, mensagem = @mensagem, status = @status, atualizado_em = datetime('now')
    WHERE id = @id
  `).run({ id, score, mensagem, status });
}

/** Busca leads qualificados de um segmento+cidade, ordenados por score desc. */
export function getLeadsQualificadosOrdenados(segmento, cidade) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM leads
       WHERE status = 'qualificado' AND segmento = @segmento AND cidade = @cidade
       ORDER BY score DESC`
    )
    .all({ segmento, cidade });
}
