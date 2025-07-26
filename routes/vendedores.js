// backend/routes/vendedores.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// Rota para buscar vendedores ativos
router.get('/', (req, res) => {
    const sql = `SELECT id, nome, tipo, meta_individual, ativo FROM Vendedores WHERE ativo = 1 ORDER BY nome`;
    
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

// Rota para buscar todos os vendedores (incluindo inativos) para gerenciamento
router.get('/all', (req, res) => {
    const sql = `SELECT id, nome, tipo, meta_individual, ativo FROM Vendedores ORDER BY nome`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar todos os vendedores:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
        
        res.json({
            success: true,
            data: rows
        });
    });
});

// Rota para criar novo vendedor/equipe
router.post('/', (req, res) => {
    const { nome, tipo, meta_individual } = req.body;
    
    if (!nome || !tipo) {
        return res.status(400).json({ 
            success: false, 
            error: 'Nome e tipo são obrigatórios' 
        });
    }
    
    const sql = `INSERT INTO Vendedores (nome, tipo, meta_individual, ativo) VALUES (?, ?, ?, 1)`;
    const params = [nome, tipo, meta_individual || 0];
    
    db.run(sql, params, function(err) {
        if (err) {
            console.error('Erro ao criar vendedor:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro interno do servidor' 
            });
        }
        
        res.json({
            success: true,
            message: 'Vendedor criado com sucesso',
            data: {
                id: this.lastID,
                nome,
                tipo,
                meta_individual: meta_individual || 0,
                ativo: 1
            }
        });
    });
});

// Rota para atualizar vendedor/equipe
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { nome, tipo, meta_individual, ativo } = req.body;
    
    if (!nome || !tipo) {
        return res.status(400).json({ 
            success: false, 
            error: 'Nome e tipo são obrigatórios' 
        });
    }
    
    const sql = `UPDATE Vendedores SET nome = ?, tipo = ?, meta_individual = ?, ativo = ? WHERE id = ?`;
    const params = [nome, tipo, meta_individual || 0, ativo !== undefined ? ativo : 1, id];
    
    db.run(sql, params, function(err) {
        if (err) {
            console.error('Erro ao atualizar vendedor:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro interno do servidor' 
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Vendedor não encontrado' 
            });
        }
        
        res.json({
            success: true,
            message: 'Vendedor atualizado com sucesso',
            data: {
                id: parseInt(id),
                nome,
                tipo,
                meta_individual: meta_individual || 0,
                ativo: ativo !== undefined ? ativo : 1
            }
        });
    });
});

// Rota para desativar vendedor (soft delete)
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    
    const sql = `UPDATE Vendedores SET ativo = 0 WHERE id = ?`;
    
    db.run(sql, [id], function(err) {
        if (err) {
            console.error('Erro ao desativar vendedor:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro interno do servidor' 
            });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Vendedor não encontrado' 
            });
        }
        
        res.json({
            success: true,
            message: 'Vendedor desativado com sucesso'
        });
    });
});

// Rota para buscar tipos de vendedores únicos
router.get('/tipos', (req, res) => {
    const sql = `SELECT DISTINCT tipo FROM Vendedores WHERE ativo = 1 ORDER BY tipo`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar tipos de vendedores:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
        
        const tipos = rows.map(row => row.tipo);
        res.json({
            success: true,
            data: tipos
        });
    });
});

module.exports = router;

