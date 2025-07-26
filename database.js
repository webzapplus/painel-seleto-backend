// backend/database.js - VERSÃO FINAL E CORRETA PARA SQLITE

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Define o caminho para a pasta 'db' de forma segura
const dbPath = path.resolve(__dirname, 'db');

// Garante que a pasta 'db' exista antes de tentar criar o arquivo dentro dela
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
    console.log(`Pasta 'db' criada em: ${dbPath}`);
}

// Define o caminho completo para o arquivo do banco de dados
const DB_SOURCE = path.join(dbPath, 'placarFLUXO.db');

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error("Erro ao abrir o banco de dados:", err.message);
        throw err;
    } else {
        console.log(`Conectado ao banco de dados SQLite em: ${DB_SOURCE}`);
        db.serialize(() => {
            console.log('Iniciando a criação/verificação das tabelas...');
            
            // Tabela Vendedores
            db.run(`
                CREATE TABLE IF NOT EXISTS Vendedores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    meta_individual REAL DEFAULT 0,
                    ativo INTEGER DEFAULT 1
                );
            `);
            
            // Tabela Produtos
            db.run(`
                CREATE TABLE IF NOT EXISTS Produtos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE,
                    valor_padrao REAL DEFAULT 0.00
                );
            `);
            
            // Tabela Clientes
            db.run(`
                CREATE TABLE IF NOT EXISTS Clientes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE,
                    estado TEXT,
                    ativo INTEGER DEFAULT 1
                );
            `);
            
            // Tabela OrdensDeCompra
            db.run(`
                CREATE TABLE IF NOT EXISTS OrdensDeCompra (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendedor_id INTEGER,
                    nome_cliente TEXT NOT NULL,
                    numero_oc TEXT UNIQUE,
                    data_pedido TEXT NOT NULL,
                    valor_total REAL NOT NULL,
                    valor_frete REAL DEFAULT 0.00,
                    motivo_pendencia TEXT DEFAULT 'Pagamento Pendente',
                    status_cor TEXT DEFAULT '#ffc107',
                    nome_cliente_final TEXT,
                    FOREIGN KEY (vendedor_id) REFERENCES Vendedores (id)
                );
            `);
            
            // Tabela OrdemDeCompraItens
            db.run(`
                CREATE TABLE IF NOT EXISTS OrdemDeCompraItens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ordem_compra_id INTEGER,
                    nome_produto TEXT NOT NULL,
                    valor_produto REAL NOT NULL,
                    FOREIGN KEY (ordem_compra_id) REFERENCES OrdensDeCompra (id) ON DELETE CASCADE
                );
            `);
            
            // Tabela Parcelas
            db.run(`
                CREATE TABLE IF NOT EXISTS Parcelas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ordem_compra_id INTEGER,
                    vendedor_id INTEGER,
                    descricao TEXT,
                    valor REAL NOT NULL,
                    data_vencimento TEXT NOT NULL,
                    status TEXT DEFAULT 'Pendente',
                    data_pagamento TEXT,
                    metodo_pagamento TEXT,
                    baixa_automatica INTEGER DEFAULT 0,
                    FOREIGN KEY (ordem_compra_id) REFERENCES OrdensDeCompra (id) ON DELETE CASCADE,
                    FOREIGN KEY (vendedor_id) REFERENCES Vendedores (id)
                );
            `, (err) => {
                if (err) {
                    console.error("Erro ao criar tabela Parcelas:", err.message);
                } else {
                    console.log('Tabelas criadas/verificadas com sucesso.');
                }
            });
        });
    }
});

module.exports = db;
