// ── Local DB — Model Aliases, MITM Alias, Combos ──

import { v4 as uuidv4 } from "uuid";
import { getDb, safeWrite } from "./core.js";

// ============ Model Aliases ============

/**
 * Get all model aliases
 */
export async function getModelAliases() {
  const db = await getDb();
  return db.data.modelAliases || {};
}

/**
 * Set model alias
 */
export async function setModelAlias(alias, model) {
  const db = await getDb();
  db.data.modelAliases[alias] = model;
  await safeWrite(db);
}

/**
 * Delete model alias
 */
export async function deleteModelAlias(alias) {
  const db = await getDb();
  delete db.data.modelAliases[alias];
  await safeWrite(db);
}

// ============ MITM Alias ============

export async function getMitmAlias(toolName) {
  const db = await getDb();
  const all = db.data.mitmAlias || {};
  if (toolName) return all[toolName] || {};
  return all;
}

export async function setMitmAliasAll(toolName, mappings) {
  const db = await getDb();
  if (!db.data.mitmAlias) db.data.mitmAlias = {};
  db.data.mitmAlias[toolName] = mappings || {};
  await safeWrite(db);
}

// ============ Combos ============

/**
 * Get all combos
 */
export async function getCombos() {
  const db = await getDb();
  return db.data.combos || [];
}

/**
 * Get combo by ID
 */
export async function getComboById(id) {
  const db = await getDb();
  return (db.data.combos || []).find(c => c.id === id) || null;
}

/**
 * Get combo by name
 */
export async function getComboByName(name) {
  const db = await getDb();
  return (db.data.combos || []).find(c => c.name === name) || null;
}

/**
 * Create combo
 */
export async function createCombo(data) {
  const db = await getDb();
  if (!db.data.combos) db.data.combos = [];

  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };

  db.data.combos.push(combo);
  await safeWrite(db);
  return combo;
}

/**
 * Update combo
 */
export async function updateCombo(id, data) {
  const db = await getDb();
  if (!db.data.combos) db.data.combos = [];

  const index = db.data.combos.findIndex(c => c.id === id);
  if (index === -1) return null;

  db.data.combos[index] = {
    ...db.data.combos[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await safeWrite(db);
  return db.data.combos[index];
}

/**
 * Delete combo
 */
export async function deleteCombo(id) {
  const db = await getDb();
  if (!db.data.combos) return false;

  const index = db.data.combos.findIndex(c => c.id === id);
  if (index === -1) return false;

  db.data.combos.splice(index, 1);
  await safeWrite(db);
  return true;
}
