// backend/routes/ordens.js
const express = require('express');
const router = express.Router();
const db = require('../database');

// Rota para buscar todas as Ordens de Compra "pendentes"
router.get('/pendentes', (req, res) => {
    // **MUDANÇA NA LÓGICA SQL**
    // A nova consulta seleciona apenas as Ordens de Compra que ainda não tiveram
    // NENHUMA parcela paga. Assim que a primeira parcela for baixada, a OC
    // desaparecerá desta lista.
    const sql = `
        SELECT 
            oc.id,
            oc.numero_oc,
            oc.nome_cliente,
            oc.valor_total,
            oc.motivo_pendencia,
            oc.status_cor,
            v.nome as nome_vendedor
        FROM 
            OrdensDeCompra oc
        LEFT JOIN 
            Vendedores v ON oc.vendedor_id = v.id
        WHERE 
            oc.id NOT IN (SELECT DISTINCT ordem_compra_id FROM Parcelas WHERE status = 'Paga')
        ORDER BY 
            oc.numero_oc ASC -- ALTERADO AQUI para ordem crescente do número da OCC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ "error": err.message });
        }
        res.json({
            message: "success",
            data: rows
        });
    });
});

// Rota para atualizar o status e a cor de uma OC
router.patch('/:id/status', (req, res) => {
    const { motivo_pendencia, status_cor } = req.body;
    const { id } = req.params;

    if (!motivo_pendencia || !status_cor) {
        return res.status(400).json({ "error": "Status e cor são obrigatórios." });
    }

    const sql = `UPDATE OrdensDeCompra SET motivo_pendencia = ?, status_cor = ? WHERE id = ?`;

    db.run(sql, [motivo_pendencia, status_cor, id], function(err) {
        if (err) {
            return res.status(500).json({ "error": err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ "error": "Ordem de Compra não encontrada." });
        }
        res.json({
            message: "Status atualizado com sucesso.",
            changes: this.changes
        });
    });
});

module.exports = router;


// Rota para excluir uma Ordem de Compra e suas parcelas
router.delete("/:id", (req, res) => {
    const { id } = req.params;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Primeiro, exclui as parcelas associadas à OC
        const sqlDeleteParcelas = `DELETE FROM Parcelas WHERE ordem_compra_id = ?`;
        db.run(sqlDeleteParcelas, [id], function (err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }

            // Em seguida, exclui a Ordem de Compra
            const sqlDeleteOC = `DELETE FROM OrdensDeCompra WHERE id = ?`;
            db.run(sqlDeleteOC, [id], function (err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                }

                if (this.changes === 0) {
                    db.run("ROLLBACK");
                    return res.status(404).json({ message: "Ordem de Compra não encontrada." });
                }

                db.run("COMMIT");
                res.json({ message: "Ordem de Compra e parcelas associadas excluídas com sucesso!" });
            });
        });
    });
});


