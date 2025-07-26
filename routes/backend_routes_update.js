// Rotas adicionais para o backend - adicionar ao arquivo principal de rotas

const express = require('express');
const db = require('./database');
const router = express.Router();

// Rota para buscar vendedores
router.get('/api/vendedores', (req, res) => {
    const sql = `SELECT id, nome FROM Vendedores WHERE ativo = 1 ORDER BY nome`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar vendedores:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
        
        res.json({
            success: true,
            data: rows
        });
    });
});

// Rota para atualizar valor da parcela
router.patch('/api/parcelas/valor/:id', (req, res) => {
    const { id } = req.params;
    const { novoValor } = req.body;
    
    if (!novoValor || isNaN(novoValor) || novoValor <= 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Valor inválido' 
        });
    }
    
    const sql = `UPDATE Parcelas SET valor = ? WHERE id = ?`;
    
    db.run(sql, [novoValor, id], function(err) {
        if (err) {
            console.error('Erro ao atualizar valor da parcela:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro interno do servidor' 
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Parcela não encontrada' 
            });
        }
        
        res.json({
            success: true,
            message: 'Valor da parcela atualizado com sucesso'
        });
    });
});

// Rota para atualizar tipo de pagamento da parcela
router.patch('/api/parcelas/tipo-pagamento/:id', (req, res) => {
    const { id } = req.params;
    const { novoTipo } = req.body;
    
    const tiposValidos = ['Boleto', 'Cartão', 'Dinheiro', 'Outro'];
    if (!novoTipo || !tiposValidos.includes(novoTipo)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Tipo de pagamento inválido' 
        });
    }
    
    const sql = `UPDATE Parcelas SET metodo_pagamento = ? WHERE id = ?`;
    
    db.run(sql, [novoTipo, id], function(err) {
        if (err) {
            console.error('Erro ao atualizar tipo de pagamento da parcela:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro interno do servidor' 
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Parcela não encontrada' 
            });
        }
        
        res.json({
            success: true,
            message: 'Tipo de pagamento atualizado com sucesso'
        });
    });
});

// Rota para baixa automática programada
router.patch('/api/parcelas/baixa-automatica/:id', (req, res) => {
    const { id } = req.params;
    const { ativar } = req.body; // true para ativar, false para desativar
    
    if (ativar) {
        // Buscar a data de vencimento da parcela
        const sqlSelect = `SELECT data_vencimento FROM Parcelas WHERE id = ? AND status = 'Pendente'`;
        
        db.get(sqlSelect, [id], (err, row) => {
            if (err) {
                console.error('Erro ao buscar parcela:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Erro interno do servidor' 
                });
            }
            
            if (!row) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Parcela não encontrada ou já paga' 
                });
            }
            
            // Atualizar para baixa automática na data de vencimento
            const sqlUpdate = `UPDATE Parcelas SET 
                status = 'Paga', 
                data_pagamento = ? 
                WHERE id = ?`;
            
            db.run(sqlUpdate, [row.data_vencimento, id], function(err) {
                if (err) {
                    console.error('Erro ao realizar baixa automática:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Erro interno do servidor' 
                    });
                }
                
                res.json({
                    success: true,
                    message: 'Baixa automática realizada com sucesso na data de vencimento'
                });
            });
        });
    } else {
        // Desativar baixa automática (estornar)
        const sqlUpdate = `UPDATE Parcelas SET 
            status = 'Pendente', 
            data_pagamento = NULL 
            WHERE id = ?`;
        
        db.run(sqlUpdate, [id], function(err) {
            if (err) {
                console.error('Erro ao desativar baixa automática:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Erro interno do servidor' 
                });
            }
            
            res.json({
                success: true,
                message: 'Baixa automática desativada com sucesso'
            });
        });
    }
});

// Atualizar a rota de busca de parcelas para incluir filtro por vendedor
router.get('/api/parcelas', (req, res) => {
    const { status, busca, vendedor, data_inicio, data_fim } = req.query;
    
    let sql = `
        SELECT 
            p.id,
            p.valor,
            p.data_vencimento,
            p.status,
            p.data_pagamento,
            p.metodo_pagamento,
            p.descricao,
            oc.numero_oc,
            oc.nome_cliente,
            oc.data_pedido as data_lancamento,
            v.nome as nome_vendedor
        FROM Parcelas p
        LEFT JOIN OrdensDeCompra oc ON p.ordem_compra_id = oc.id
        LEFT JOIN Vendedores v ON p.vendedor_id = v.id
        WHERE 1=1
    `;
    
    const params = [];
    
    // Filtro por status
    if (status && status !== 'todas') {
        if (status === 'paga') {
            sql += ` AND p.status = 'Paga'`;
        } else if (status === 'pendente') {
            sql += ` AND p.status = 'Pendente' AND p.data_vencimento >= date('now')`;
        } else if (status === 'atrasada') {
            sql += ` AND p.status = 'Pendente' AND p.data_vencimento < date('now')`;
        }
    }
    
    // Filtro por vendedor
    if (vendedor && vendedor !== 'todos') {
        sql += ` AND p.vendedor_id = ?`;
        params.push(vendedor);
    }
    
    // Filtro por busca
    if (busca) {
        sql += ` AND (oc.nome_cliente LIKE ? OR oc.numero_oc LIKE ? OR p.descricao LIKE ?)`;
        const searchTerm = `%${busca}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Filtro por data
    if (data_inicio && data_fim) {
        sql += ` AND p.data_vencimento BETWEEN ? AND ?`;
        params.push(data_inicio, data_fim);
    }
    
    sql += ` ORDER BY p.data_vencimento ASC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar parcelas:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
        
        // Determinar status baseado na data de vencimento
        const parcelasComStatus = rows.map(parcela => {
            let statusFinal = parcela.status;
            
            if (parcela.status === 'Pendente') {
                const hoje = new Date();
                const vencimento = new Date(parcela.data_vencimento);
                
                if (vencimento < hoje) {
                    statusFinal = 'Atrasada';
                }
            }
            
            return {
                ...parcela,
                status: statusFinal
            };
        });
        
        res.json({
            success: true,
            data: parcelasComStatus
        });
    });
});

module.exports = router;

