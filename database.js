// backend/database.js
const sqlite3 = require('sqlite3').verbose();
// A MUDANÇA ESTÁ AQUI: Adicionamos 'db/' ao caminho
const DB_SOURCE = './db/placarFLUXO.db'; 

const db = new sqlite3.Database(DB_SOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        // O resto do seu código que cria as tabelas continua aqui...
    }
});

module.exports = db;
        console.log('Conectado ao banco de dados SQLite.');
        db.serialize(() => {
            console.log('Iniciando a criação/verificação das tabelas...');

            db.run(`
                CREATE TABLE IF NOT EXISTS Vendedores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL,
                    tipo TEXT NOT NULL CHECK(tipo IN ('Comercial', 'Técnico')),
                    meta_individual REAL DEFAULT 270000.00,
                    ativo BOOLEAN DEFAULT 1
                );
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS Produtos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE,
                    valor_padrao REAL DEFAULT 0.00
                );
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS OrdensDeCompra (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendedor_id INTEGER NOT NULL,
                    nome_cliente TEXT NOT NULL,
                    numero_oc TEXT UNIQUE,
                    data_pedido DATE NOT NULL,
                    valor_total REAL NOT NULL,
                    valor_frete REAL DEFAULT 0.00,
                    motivo_pendencia TEXT DEFAULT 'Pagamento Pendente',
                    status_cor TEXT DEFAULT '#ffc107', -- **NOVO: Cor padrão amarela**
                    FOREIGN KEY (vendedor_id) REFERENCES Vendedores (id) ON DELETE CASCADE
                );
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS OrdemDeCompraItens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ordem_compra_id INTEGER NOT NULL,
                    nome_produto TEXT NOT NULL,
                    valor_produto REAL NOT NULL,
                    FOREIGN KEY (ordem_compra_id) REFERENCES OrdensDeCompra (id) ON DELETE CASCADE
                );
            `);

            // Tabela de Parcelas (VERSÃO ATUALIZADA COM BAIXA AUTOMÁTICA)
            db.run(`
                CREATE TABLE IF NOT EXISTS Parcelas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ordem_compra_id INTEGER,
                    vendedor_id INTEGER, -- <<< COLUNA ADICIONADA
                    descricao TEXT,
                    valor REAL NOT NULL,
                    data_vencimento DATE NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('Pendente', 'Paga')) DEFAULT 'Pendente',
                    data_pagamento DATE,
                    metodo_pagamento TEXT CHECK(metodo_pagamento IN ('Boleto', 'Cartão', 'Dinheiro', 'Outro')),
                    baixa_automatica INTEGER DEFAULT 0 CHECK(baixa_automatica IN (0, 1)), -- <<< NOVA COLUNA PARA BAIXA AUTOMÁTICA
                    FOREIGN KEY (ordem_compra_id) REFERENCES OrdensDeCompra (id) ON DELETE SET NULL,
                    FOREIGN KEY (vendedor_id) REFERENCES Vendedores (id) ON DELETE SET NULL -- <<< CHAVE ESTRANGEIRA ADICIONADA
                );
            `);

            // Verificar se a coluna baixa_automatica já existe, se não, adicionar
            db.all("PRAGMA table_info(Parcelas)", [], (err, columns) => {
                if (err) {
                    console.error('Erro ao verificar estrutura da tabela Parcelas:', err);
                    return;
                }
                
                const hasLowAutoColumn = columns.some(col => col.name === 'baixa_automatica');
                
                if (!hasLowAutoColumn) {
                    console.log('Adicionando coluna baixa_automatica à tabela Parcelas...');
                    db.run(`ALTER TABLE Parcelas ADD COLUMN baixa_automatica INTEGER DEFAULT 0 CHECK(baixa_automatica IN (0, 1))`, (err) => {
                        if (err) {
                            console.error('Erro ao adicionar coluna baixa_automatica:', err);
                        } else {
                            console.log('Coluna baixa_automatica adicionada com sucesso!');
                        }
                    });
                } else {
                    console.log('Coluna baixa_automatica já existe na tabela Parcelas.');
                }
            });

            console.log('Tabelas criadas/verificadas com sucesso.');
        });
    }
});

module.exports = db;

