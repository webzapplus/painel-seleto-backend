// backend/routes/parcelas.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// **MUDANÇA: Rota GET atualizada para aceitar data_inicio e data_fim**
router.get('/', (req, res) => {
    // Destrutura os novos parâmetros de data
    const { status, busca, data_inicio, data_fim } = req.query;
    
    let sql = `
         SELECT 
            p.id, p.ordem_compra_id, p.descricao, p.valor, p.data_vencimento, 
            p.status as status_db, p.data_pagamento, p.metodo_pagamento,
            oc.numero_oc, oc.nome_cliente, oc.data_pedido as data_lancamento,
            COALESCE(v_oc.nome, v_parcela.nome) as nome_vendedor
        FROM 
            Parcelas p
        LEFT JOIN OrdensDeCompra oc ON p.ordem_compra_id = oc.id
        LEFT JOIN Vendedores v_oc ON oc.vendedor_id = v_oc.id
        LEFT JOIN Vendedores v_parcela ON p.vendedor_id = v_parcela.id
    `;
    const whereClauses = [];
    const params = [];

    // **MUDANÇA: Lógica de filtro de data atualizada**
    if (data_inicio && data_fim) {
        whereClauses.push("p.data_vencimento BETWEEN ? AND ?");
        params.push(data_inicio, data_fim);
    }

    if (busca) {
        whereClauses.push("(oc.nome_cliente LIKE ? OR p.descricao LIKE ? OR oc.numero_oc LIKE ?)");
        const buscaParam = `%${busca}%`;
        params.push(buscaParam, buscaParam, buscaParam);
    }
    if (status && status !== 'todas') {
        switch(status.toLowerCase()) {
            case 'paga': whereClauses.push("p.status = 'Paga'"); break;
            case 'pendente': whereClauses.push("p.status = 'Pendente' AND date(p.data_vencimento) >= date('now', 'localtime')"); break;
            case 'atrasada': whereClauses.push("p.status = 'Pendente' AND date(p.data_vencimento) < date('now', 'localtime')"); break;
        }
    }
    if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    sql += ` ORDER BY p.data_vencimento ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(400).json({"error": err.message});
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const parcelasComStatusFinal = rows.map(row => {
            let statusFinal = row.status_db;
            if (row.status_db === 'Pendente' && new Date(row.data_vencimento + 'T00:00:00-03:00') < hoje) {
                statusFinal = 'Atrasada';
            }
            return { ...row, status: statusFinal };
        });
        res.json({ message: "success", data: parcelasComStatusFinal });
    });
});

// ... (o resto do ficheiro permanece igual)

// Rota POST /extra 
router.post('/extra', (req, res) => {
    const { descricao, valor, data_vencimento, metodo_pagamento, vendedor_id } = req.body;
    if (!descricao || !valor || !data_vencimento) {
        return res.status(400).json({ "error": "Campos obrigatórios faltando." });
    }
    const sql = `INSERT INTO Parcelas (descricao, valor, data_vencimento, metodo_pagamento, status, vendedor_id) VALUES (?, ?, ?, ?, 'Pendente', ?)`;
    db.run(sql, [descricao, valor, data_vencimento, metodo_pagamento || 'Outro', vendedor_id || null], function (err) {
        if (err) return res.status(400).json({"error": err.message});
        res.status(201).json({ message: "Conta extra adicionada com sucesso.", id: this.lastID });
    });
});

router.put('/baixar/:id', (req, res) => {
    const { data_pagamento } = req.body;
    const dataPagamentoFinal = data_pagamento ? data_pagamento : new Date().toISOString().split('T')[0];
    const sql = `UPDATE Parcelas SET status = 'Paga', data_pagamento = ? WHERE id = ?`;
    db.run(sql, [dataPagamentoFinal, req.params.id], function (err) {
        if (err) { res.status(400).json({"error": err.message}); return; }
        res.json({ message: "Parcela baixada com sucesso.", changes: this.changes });
    });
});
router.put('/estornar/:id', (req, res) => {
    const sql = `UPDATE Parcelas SET status = 'Pendente', data_pagamento = NULL WHERE id = ?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) { res.status(400).json({"error": err.message}); return; }
        res.json({ message: "Parcela estornada com sucesso.", changes: this.changes });
    });
});
router.patch('/vencimento/:id', (req, res) => {
    const { novaData } = req.body;
    if (!novaData) return res.status(400).json({ "error": "A nova data de vencimento é obrigatória." });
    const sql = `UPDATE Parcelas SET data_vencimento = ? WHERE id = ?`;
    db.run(sql, [novaData, req.params.id], function(err) {
        if (err) return res.status(500).json({ "error": err.message });
        res.json({ message: "Data de vencimento atualizada com sucesso.", changes: this.changes });
    });
});
router.patch('/liquidacao/:id', (req, res) => {
    const { novaData } = req.body;
    if (!novaData) return res.status(400).json({ "error": "A nova data de liquidação é obrigatória." });
    const sql = `UPDATE Parcelas SET data_pagamento = ? WHERE id = ?`;
    db.run(sql, [novaData, req.params.id], function(err) {
        if (err) return res.status(500).json({ "error": err.message });
        res.json({ message: "Data de liquidação atualizada com sucesso.", changes: this.changes });
    });
});

module.exports = router;


router.patch("/lancamento/:id", (req, res) => {
    const { novaData } = req.body;
    if (!novaData) return res.status(400).json({ "error": "A nova data de lançamento é obrigatória." });
    const sql = `UPDATE OrdensDeCompra SET data_pedido = ? WHERE id = (SELECT ordem_compra_id FROM Parcelas WHERE id = ?)`;
    db.run(sql, [novaData, req.params.id], function(err) {
        if (err) return res.status(500).json({ "error": err.message });
        res.json({ message: "Data de lançamento atualizada com sucesso.", changes: this.changes });
    });
});


