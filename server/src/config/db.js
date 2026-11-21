/**
 * MySQL Database Client (XAMPP / local / remote MySQL)
 * Uses mysql2. SQL is authored in MySQL style; translateSql provides a
 * compatibility shim that also accepts the legacy Postgres-style placeholders
 * ($1, $2, ...) and ON CONFLICT / RETURNING clauses.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'vone_calling_ai_telugu',
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

function sanitizeParams(params = []) {
  if (!Array.isArray(params)) return [];
  return params.map((p) => (p === undefined ? null : p));
}

function isDuplicateKeyError(err) {
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

function isConnectionError(err) {
  const codes = ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET'];
  if (codes.includes(err?.code)) return true;
  if (Array.isArray(err?.errors)) return err.errors.some((e) => codes.includes(e?.code));
  return false;
}

function asConflictError(err) {
  if (!isDuplicateKeyError(err)) return err;
  const conflict = new Error('This record already exists. Duplicate values are not allowed for this field.');
  conflict.code = 'DUPLICATE_ENTRY';
  conflict.status = 409;
  conflict.cause = err;
  return conflict;
}

function handleQueryError(err) {
  if (isDuplicateKeyError(err)) throw asConflictError(err);
  if (!isConnectionError(err)) throw err;
  console.error(`[db] Cannot reach MySQL (${err.code || err.message}).`);
  const e = new Error('Database unavailable. Cannot reach MySQL.');
  e.code = 'DB_UNAVAILABLE';
  e.status = 503;
  throw e;
}

function translateSql(sql) {
  if (typeof sql !== 'string') return sql;
  let s = sql.trim();

  // Convert Postgres ON CONFLICT ... DO NOTHING -> MySQL no-op upsert
  s = s.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+NOTHING/gi, 'ON DUPLICATE KEY UPDATE id = id');

  // Convert Postgres ON CONFLICT ... DO UPDATE SET ... -> MySQL ON DUPLICATE KEY UPDATE ...
  s = s.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');

  // Convert EXCLUDED.col -> VALUES(col)
  s = s.replace(/\bEXCLUDED\.([a-zA-Z_][a-zA-Z0-9_]*)/gi, 'VALUES($1)');

  // Remove Postgres RETURNING clause
  s = s.replace(/\s+RETURNING\b[^;]*/gi, '');

  // Remove Postgres type casts (::type)
  s = s.replace(/::[a-zA-Z_][a-zA-Z0-9_]*/g, '');

  // Convert Postgres EXTRACT(EPOCH FROM (a - b)) to MySQL (UNIX_TIMESTAMP(a) - UNIX_TIMESTAMP(b))
  s = s.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(\s*([a-zA-Z0-9_.]+)\s*-\s*([a-zA-Z0-9_.]+)\s*\)\)/gi,
    '(UNIX_TIMESTAMP($1) - UNIX_TIMESTAMP($2))');

  // Convert Postgres quoted intervals ('7 days') to MySQL (7 DAY)
  s = s.replace(/INTERVAL\s+'(\d+)\s+(\w+)'/gi, (_, n, unit) => `INTERVAL ${n} ${unit.toUpperCase().replace(/S$/, '')}`);

  // Convert $1, $2, ... placeholders to ?
  s = s.replace(/\$\d+/g, '?');

  return s;
}

async function query(sql, params = []) {
  const mySql = translateSql(sql);
  const sanitized = sanitizeParams(params);
  try {
    const [rows] = await getPool().query(mySql, sanitized);
    return rows;
  } catch (err) {
    if (isConnectionError(err)) {
      try {
        const [rows] = await getPool().query(mySql, sanitized);
        return rows;
      } catch (retryErr) {
        handleQueryError(retryErr);
      }
    }
    handleQueryError(err);
  }
}

async function queryAll(sql, params = []) {
  return query(sql, params);
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function insert(sql, params = []) {
  const mySql = translateSql(sql);
  const sanitized = sanitizeParams(params);
  try {
    const [result] = await getPool().execute(mySql, sanitized);
    return {
      insertId: result.insertId || 0,
      affectedRows: result.affectedRows || 0,
    };
  } catch (err) {
    if (isConnectionError(err)) {
      try {
        const [result] = await getPool().execute(mySql, sanitized);
        return {
          insertId: result.insertId || 0,
          affectedRows: result.affectedRows || 0,
        };
      } catch (retryErr) {
        if (isDuplicateKeyError(retryErr)) throw asConflictError(retryErr);
        handleQueryError(retryErr);
      }
    }
    if (isDuplicateKeyError(err)) throw asConflictError(err);
    handleQueryError(err);
  }
}

async function upsert(sql, params = []) {
  const result = await insert(sql, params);
  return { ...result, created: result.affectedRows === 1 };
}

async function update(sql, params = []) {
  const mySql = translateSql(sql);
  const sanitized = sanitizeParams(params);
  try {
    const [result] = await getPool().execute(mySql, sanitized);
    return { affectedRows: result.affectedRows || 0, changedRows: result.changedRows || result.affectedRows || 0 };
  } catch (err) {
    if (isConnectionError(err)) {
      try {
        const [result] = await getPool().execute(mySql, sanitized);
        return { affectedRows: result.affectedRows || 0, changedRows: result.changedRows || result.affectedRows || 0 };
      } catch (retryErr) {
        if (isDuplicateKeyError(retryErr)) throw asConflictError(retryErr);
        handleQueryError(retryErr);
      }
    }
    if (isDuplicateKeyError(err)) throw asConflictError(err);
    handleQueryError(err);
  }
}

async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const tx = {
      query: async (sql, params = []) => {
        const [rows] = await conn.query(translateSql(sql), sanitizeParams(params));
        return rows;
      },
      execute: async (sql, params = []) => {
        const [rows, fields] = await conn.query(translateSql(sql), sanitizeParams(params));
        return [rows, fields];
      },
    };
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function testConnection() {
  const conn = await getPool().getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}

module.exports = {
  getPool,
  query,
  queryAll,
  queryOne,
  insert,
  upsert,
  update,
  withTransaction,
  testConnection,
  isDuplicateKeyError,
  translateSql,
};