// painel-financeiro-backend/index.js - VERSÃO CORRIGIDA
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;
const db = require('./database.js');

// --- IMPORTAÇÃO DAS ROTAS MODULARIZADAS ---
const parcelasRoutes = require('./routes/parcelas');
const ordensRouter = require('./routes/ordens');
const vendedoresRoutes = require('./routes/vendedores');

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
}));

app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.get('Origin') || 'N/A'}`);
    next();
});

// --- USO DAS ROTAS MODULARIZADAS ---
app.use('/api/parcelas', parcelasRoutes);
app.use('/api/ordens', ordensRouter);
app.use('/api/vendedores', vendedoresRoutes);

// --- ROTA DE TESTE ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor backend funcionando corretamente' });
});

// --- ROTAS DE PRODUTOS ---
app.get('/api/produtos', (req, res) => {
    db.all("SELECT * FROM Produtos ORDER BY nome", [], (err, rows) => {
        if (err) return res.status(500).json({ "error": err.message });
        res.json({ message: "success", data: rows });
    });
});
app.post('/api/produtos', (req, res) => { /* ... (código sem alterações) ... */ });
app.delete('/api/produtos/:id', (req, res) => { /* ... (código sem alterações) ... */ });


// --- ROTAS DE CLIENTES ---

// ROTA PARA BUSCAR CLIENTES (COM O ERRO DE DIGITAÇÃO CORRIGIDO)
app.get('/api/clientes', (req, res) => { // CORRIGIDO DE 'aapp' PARA 'app'
    db.all("SELECT id, nome, estado FROM Clientes WHERE ativo = 1 ORDER BY nome", [], (err, rows) => {
        if (err) return res.status(500).json({ "error": err.message });
        res.json({ message: "success", data: rows });
    });
});

// ROTA PARA CRIAR CLIENTES
app.post('/api/clientes', (req, res) => {
    const { nome, estado } = req.body;
    if (!nome) return res.status(400).json({ "error": "O nome do cliente é obrigatório." });

    const sql = `INSERT INTO Clientes (nome, estado) VALUES (?, ?)`;
    db.run(sql, [nome, estado || null], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ "error": "Este nome de cliente já existe." });
            }
            return res.status(500).json({ "error": err.message });
        }
        res.json({ message: "success", data: { id: this.lastID, nome, estado } });
    });
});


// --- ROTAS DE ORDENS DE COMPRA ---

// ROTA PARA VERIFICAR SE UMA OC JÁ EXISTE
app.get('/api/ordens/check/:numeroOc', (req, res) => {
    const { numeroOc } = req.params;
    const sql = `SELECT COUNT(*) as count FROM OrdensDeCompra WHERE numero_oc = ?`;
    db.get(sql, [numeroOc], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ exists: row.count > 0 });
    });
});

// ROTA PARA CRIAR ORDENS DE COMPRA (ATUALIZADA PARA INCLUIR 'nome_cliente_final')
app.post('/api/ordens-compra', (req, res) => {
    // Adicionamos 'nome_cliente_final' que vem do frontend
    const { vendedor_id, nome_cliente, nome_cliente_final, numero_oc, data_pedido, produtos, valor_frete, parcelas } = req.body;
    
    if (!vendedor_id || !nome_cliente || !numero_oc || !data_pedido || !produtos || produtos.length === 0 || !parcelas || parcelas.length === 0) {
        return res.status(400).json({ "error": "Todos os campos obrigatórios devem ser preenchidos." });
    }

    const valor_total = produtos.reduce((total, item) => total + item.valor, 0);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Adicionamos a nova coluna ao INSERT
        const sqlOc = `
            INSERT INTO OrdensDeCompra 
            (vendedor_id, nome_cliente, numero_oc, data_pedido, valor_total, valor_frete, nome_cliente_final) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        // Adicionamos o novo parâmetro
        const paramsOc = [vendedor_id, nome_cliente, numero_oc, data_pedido, valor_total, valor_frete || 0, nome_cliente_final || null];
        
        db.run(sqlOc, paramsOc, function (err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ "error": `Erro ao inserir OC: ${err.message}` });
            }
            
            const ordemCompraId = this.lastID;
            let erroOcorrido = false;
            let completedTasks = 0;
            const totalTasks = produtos.length + parcelas.length;

            const finalizaTransacao = () => {
                if (erroOcorrido) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ "error": "Erro ao inserir itens ou parcelas." });
                } else {
                    db.run('COMMIT');
                    return res.json({ "message": "success", data: { id: ordemCompraId } });
                }
            };
            
            // ... (resto da lógica de inserir itens e parcelas continua a mesma) ...
            const sqlItem = `INSERT INTO OrdemDeCompraItens (ordem_compra_id, nome_produto, valor_produto) VALUES (?, ?, ?)`;
            produtos.forEach(item => {
                db.run(sqlItem, [ordemCompraId, item.nome, item.valor], (err) => {
                    if (err) erroOcorrido = true;
                    completedTasks++;
                    if (completedTasks === totalTasks) finalizaTransacao();
                });
            });

            const sqlParcela = `INSERT INTO Parcelas (ordem_compra_id, valor, data_vencimento, metodo_pagamento, status) VALUES (?, ?, ?, ?, 'Pendente')`;
            parcelas.forEach((p) => {
                if (!p.valor || !p.data_vencimento || !p.forma_pagamento) {
                    console.error('Parcela inválida:', p);
                    erroOcorrido = true;
                    return;
                }
                
                let metodoPagamento = p.forma_pagamento;
                if (metodoPagamento === 'Cartao') metodoPagamento = 'Cartão';
                
                db.run(sqlParcela, [ordemCompraId, p.valor, p.data_vencimento, metodoPagamento], (err) => {
                    if (err) {
                        console.error('Erro ao inserir parcela:', err);
                        erroOcorrido = true;
                    }
                    completedTasks++;
                    if (completedTasks === totalTasks) finalizaTransacao();
                });
            });
        });
    });
});

// --- ROTAS DE DASHBOARD E RANKINGS (CORRIGIDAS) ---
app.get('/api/dashboard/kpis', (req, res) => {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ "error": "Ano e Mês são obrigatórios." });
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

    const sqlVendido = `
        SELECT SUM(oc.valor_total) AS totalVendido 
        FROM OrdensDeCompra oc
        JOIN Vendedores v ON oc.vendedor_id = v.id
        WHERE strftime('%Y-%m', oc.data_pedido) = ?
        AND v.tipo != 'Assistência Técnica'
    `;

    const sqlEfetivado = `
        SELECT SUM(oc.valor_total) AS totalEfetivado 
        FROM OrdensDeCompra oc
        JOIN Vendedores v ON oc.vendedor_id = v.id
        WHERE strftime('%Y-%m', oc.data_pedido) = ?
        AND v.tipo != 'Assistência Técnica'
        AND oc.id IN (
            SELECT DISTINCT p.ordem_compra_id FROM Parcelas p WHERE p.status = 'Paga'
        )
    `;

    const sqlRecebido = `
        SELECT SUM(p.valor) AS totalRecebido 
        FROM Parcelas p
        JOIN OrdensDeCompra oc ON p.ordem_compra_id = oc.id
        JOIN Vendedores v ON oc.vendedor_id = v.id
        WHERE p.status = 'Paga'
        AND strftime('%Y-%m', p.data_pagamento) = ?
        AND v.tipo != 'Assistência Técnica'
    `;

    const sqlNaoEfetivados = `
        SELECT COUNT(oc.id) AS countNaoEfetivados, SUM(oc.valor_total) AS valorNaoEfetivados
        FROM OrdensDeCompra oc
        JOIN Vendedores v ON oc.vendedor_id = v.id
        WHERE strftime('%Y-%m', oc.data_pedido) = ?
        AND oc.id NOT IN (
            SELECT DISTINCT p.ordem_compra_id FROM Parcelas p WHERE p.status = 'Paga'
        )
        AND v.tipo != 'Assistência Técnica'
    `;

    const sqlMetaMensal = `
        SELECT SUM(meta_individual) AS metaMensal
        FROM Vendedores 
        WHERE tipo = 'Comercial' AND ativo = 1
    `;

    const kpis = {};
    Promise.all([
        new Promise((resolve, reject) => db.get(sqlVendido, [periodo], (err, row) => err ? reject(err) : resolve(row))),
        new Promise((resolve, reject) => db.get(sqlEfetivado, [periodo], (err, row) => err ? reject(err) : resolve(row))),
        new Promise((resolve, reject) => db.get(sqlRecebido, [periodo], (err, row) => err ? reject(err) : resolve(row))),
        new Promise((resolve, reject) => db.get(sqlNaoEfetivados, [periodo], (err, row) => err ? reject(err) : resolve(row))),
        new Promise((resolve, reject) => db.get(sqlMetaMensal, [], (err, row) => err ? reject(err) : resolve(row))),
    ]).then(([vendidoRow, efetivadoRow, recebidoRow, naoEfetivadosRow, metaRow]) => {
        kpis.totalVendido = vendidoRow?.totalVendido || 0;
        kpis.totalEfetivado = efetivadoRow?.totalEfetivado || 0;
        kpis.totalRecebido = recebidoRow?.totalRecebido || 0;
        kpis.countNaoEfetivados = naoEfetivadosRow?.countNaoEfetivados || 0;
        kpis.valorNaoEfetivados = naoEfetivadosRow?.valorNaoEfetivados || 0;
        kpis.metaMensal = metaRow?.metaMensal || 2100000.00;
        res.json({ message: "success", data: kpis });
    }).catch(err => {
        console.error('Erro na rota /api/dashboard/kpis:', err);
        res.status(500).json({ "error": err.message });
    });
});

app.get('/api/dashboard/daily-activity', (req, res) => {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ "error": "Ano e Mês são obrigatórios." });
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

    const sqlVendas = `SELECT strftime('%d', data_pedido) as dia, valor_total FROM OrdensDeCompra WHERE strftime('%Y-%m', data_pedido) = ?`;
    const sqlRecebimentos = `SELECT strftime('%d', data_pagamento) as dia, valor FROM Parcelas WHERE status = 'Paga' AND strftime('%Y-%m', data_pagamento) = ?`;
    const sqlEfetivacoes = `
        SELECT oc.valor_total, MIN(p.data_pagamento) as data_efetivacao
        FROM Parcelas p
        JOIN OrdensDeCompra oc ON p.ordem_compra_id = oc.id
        WHERE p.status = 'Paga' AND strftime('%Y-%m', (SELECT MIN(sub_p.data_pagamento) FROM Parcelas sub_p WHERE sub_p.ordem_compra_id = oc.id AND sub_p.status = 'Paga')) = ?
        GROUP BY oc.id, oc.valor_total`;

    Promise.all([
        new Promise((resolve, reject) => db.all(sqlVendas, [periodo], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlRecebimentos, [periodo], (err, rows) => err ? reject(err) : resolve(rows))),
        new Promise((resolve, reject) => db.all(sqlEfetivacoes, [periodo], (err, rows) => err ? reject(err) : resolve(rows))),
    ]).then(([vendas, recebimentos, efetivacoes]) => {
        const diasNoMes = new Date(ano, mes, 0).getDate();
        const chartData = Array.from({ length: diasNoMes }, (_, i) => ({ dia: String(i + 1).padStart(2, '0'), vendido: 0, recebido: 0, efetivado: 0 }));

        vendas.forEach(v => { chartData[parseInt(v.dia, 10) - 1].vendido += v.valor_total; });
        recebimentos.forEach(r => { if(r.dia) chartData[parseInt(r.dia, 10) - 1].recebido += r.valor; });
        efetivacoes.forEach(e => {
            if (e.data_efetivacao) {
                const diaEfetivacao = e.data_efetivacao.split('-')[2];
                chartData[parseInt(diaEfetivacao, 10) - 1].efetivado += e.valor_total;
            }
        });
        res.json({ message: "success", data: chartData });
    }).catch(err => {
        console.error('Erro na rota /api/dashboard/daily-activity:', err);
        res.status(500).json({ "error": err.message });
    });
});

app.get('/api/rankings/fluxo-caixa', (req, res) => {
    const { ano, mes } = req.query;
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;
    const sql = `
        SELECT
            v.id, v.nome, SUM(p.valor) AS total_recebido_mes,
            (
                SELECT SUM(sub_oc.valor_total) 
                FROM OrdensDeCompra sub_oc 
                WHERE sub_oc.vendedor_id = v.id AND strftime('%Y-%m', sub_oc.data_pedido) = ?
            ) as total_vendido_periodo,
            (
                SELECT SUM(sub_oc.valor_total)
                FROM OrdensDeCompra sub_oc
                WHERE sub_oc.vendedor_id = v.id
                AND strftime('%Y-%m', sub_oc.data_pedido) = ?
                AND sub_oc.id IN (SELECT DISTINCT p.ordem_compra_id FROM Parcelas p WHERE p.status = 'Paga')
            ) AS total_efetivado
        FROM Vendedores v
        JOIN OrdensDeCompra oc ON v.id = oc.vendedor_id
        JOIN Parcelas p ON oc.id = p.ordem_compra_id
        WHERE
            v.tipo = 'Comercial' AND
            v.ativo = 1 AND -- <<<<<<< FILTRO ADICIONADO AQUI
            strftime('%Y-%m', p.data_pagamento) = ?
        GROUP BY v.id, v.nome
        ORDER BY total_recebido_mes DESC;
    `;
    db.all(sql, [periodo, periodo, periodo], (err, rows) => {
        if (err) {
            console.error('Erro na rota /api/rankings/fluxo-caixa:', err);
            return res.status(500).json({ "error": err.message });
        }
        res.json({ message: "success", data: rows });
    });
});

app.get('/api/rankings/vendas', (req, res) => {
    const { ano, mes } = req.query;
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;
    const sql = `
        SELECT
            v.id, v.nome, v.tipo, v.meta_individual,
            COUNT(oc.id) AS total_ocs,
            SUM(oc.valor_total) AS total_vendido,
            (
                SELECT SUM(sub_oc.valor_total)
                FROM OrdensDeCompra sub_oc
                WHERE sub_oc.vendedor_id = v.id
                AND strftime('%Y-%m', sub_oc.data_pedido) = ?
                AND sub_oc.id IN (SELECT DISTINCT p.ordem_compra_id FROM Parcelas p WHERE p.status = 'Paga')
            ) AS total_efetivado,
            (
                SELECT COALESCE(SUM(sub_oc.valor_total), 0)
                FROM OrdensDeCompra sub_oc
                WHERE sub_oc.vendedor_id = v.id
                AND strftime('%Y-%m', sub_oc.data_pedido) = ?
            ) AS total_vendido_mes
        FROM Vendedores v
        LEFT JOIN OrdensDeCompra oc ON v.id = oc.vendedor_id AND strftime('%Y-%m', oc.data_pedido) = ?
        WHERE v.ativo = 1
        GROUP BY v.id, v.nome, v.tipo, v.meta_individual
        ORDER BY total_vendido_mes DESC;
    `;
    db.all(sql, [periodo, periodo, periodo], (err, rows) => {
        if (err) {
            console.error('Erro na rota /api/rankings/vendas:', err);
            return res.status(500).json({ "error": err.message });
        }
        res.json({ message: "success", data: rows });
    });
});

// --- ROTA PARA DADOS DE PAGAMENTO POR MÉTODO ---
app.get('/api/dashboard/payment-methods', (req, res) => {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ "error": "Ano e Mês são obrigatórios." });
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

    const sql = `
        SELECT 
            p.metodo_pagamento,
            SUM(p.valor) AS total_valor
        FROM Parcelas p
        JOIN OrdensDeCompra oc ON p.ordem_compra_id = oc.id
        JOIN Vendedores v ON oc.vendedor_id = v.id
        WHERE 
            p.status = 'Paga'
            AND strftime('%Y-%m', p.data_pagamento) = ?
            AND v.tipo != 'Assistência Técnica'
        GROUP BY p.metodo_pagamento
    `;

    db.all(sql, [periodo], (err, rows) => {
        if (err) {
            console.error('Erro na rota /api/dashboard/payment-methods:', err);
            return res.status(500).json({ "error": err.message });
        }
        
        const paymentData = {
            'Boleto': 0,
            'Cartão': 0,
            'Dinheiro': 0
        };

        rows.forEach(row => {
            const metodo = row.metodo_pagamento;
            if (paymentData.hasOwnProperty(metodo)) {
                paymentData[metodo] = row.total_valor || 0;
            }
        });

        res.json({ message: "success", data: paymentData });
    });
});

// --- ROTA PARA TOP 3 VENDAS ---
app.get('/api/dashboard/top-vendas', (req, res) => {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ "error": "Ano e Mês são obrigatórios." });
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

    const sql = `
        SELECT 
            oc.nome_cliente,
            oc.valor_total,
            v.nome as nome_vendedor
        FROM OrdensDeCompra oc
        JOIN Vendedores v ON oc.vendedor_id = v.id
        WHERE strftime('%Y-%m', oc.data_pedido) = ?
        ORDER BY oc.valor_total DESC
        LIMIT 3
    `;

    db.all(sql, [periodo], (err, rows) => {
        if (err) {
            console.error('Erro na rota /api/dashboard/top-vendas:', err);
            return res.status(500).json({ "error": err.message });
        }
        res.json({ message: "success", data: rows });
    });
});

// backend/index.js

// --- ROTA PARA TOP 3 EQUIPAMENTOS (COM EXCLUSÃO DE ITEM ESPECÍFICO) ---
app.get('/api/dashboard/top-equipamentos', (req, res) => {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ "error": "Ano e Mês são obrigatórios." });
    const periodo = `${ano}-${String(mes).padStart(2, '0')}`;

    const sql = `
        SELECT 
            oci.nome_produto as equipamento,
            COUNT(oci.id) as quantidade_vendida
        FROM 
            Vendedores v
        JOIN 
            OrdensDeCompra oc ON v.id = oc.vendedor_id
        JOIN 
            OrdemDeCompraItens oci ON oc.id = oci.ordem_compra_id
        WHERE 
            v.tipo = 'Comercial' AND 
            strftime('%Y-%m', oc.data_pedido) = ? AND
            oci.nome_produto NOT IN ('MOLDE FBs') -- <<<<<<< NOVA LINHA DE FILTRO AQUI
        GROUP BY 
            oci.nome_produto
        ORDER BY 
            quantidade_vendida DESC
        LIMIT 3
    `;

    db.all(sql, [periodo], (err, rows) => {
        if (err) {
            console.error('Erro na rota /api/dashboard/top-equipamentos:', err);
            return res.status(500).json({ "error": err.message });
        }
        res.json({ message: "success", data: rows });
    });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error('Erro no servidor:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor' 
    });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
    console.log(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
        success: false, 
        error: 'Rota não encontrada' 
    });
});

// --- CONFIGURAÇÃO DO SERVIDOR PARA ACEITAR CONEXÕES EXTERNAS ---
// Escuta em 0.0.0.0 para aceitar conexões de qualquer IP (necessário para ngrok)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor backend rodando em http://0.0.0.0:${PORT}`);
    console.log(`📡 Pronto para aceitar conexões externas via ngrok`);
    console.log(`🔗 Teste de saúde: http://localhost:${PORT}/api/health`);
});

module.exports = app;

