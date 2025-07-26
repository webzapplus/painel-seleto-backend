// script_baixa_automatica.js
// Script para executar baixa automática de parcelas na data de vencimento
// Execute este script diariamente via cron job ou task scheduler

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Configuração do banco de dados
const DB_SOURCE = path.join(__dirname, 'placarFLUXO.db');

function executarBaixaAutomatica() {
    console.log(`[${new Date().toISOString()}] Iniciando processo de baixa automática...`);
    
    const db = new sqlite3.Database(DB_SOURCE, (err) => {
        if (err) {
            console.error('Erro ao conectar ao banco de dados:', err.message);
            return;
        }
        console.log('Conectado ao banco de dados SQLite.');
    });

    // Buscar parcelas que devem ser baixadas automaticamente
    const sqlSelect = `
        SELECT 
            id, 
            valor, 
            data_vencimento, 
            metodo_pagamento,
            descricao,
            ordem_compra_id
        FROM Parcelas 
        WHERE 
            status = 'Pendente' 
            AND baixa_automatica = 1 
            AND date(data_vencimento) <= date('now', 'localtime')
    `;

    db.all(sqlSelect, [], (err, parcelas) => {
        if (err) {
            console.error('Erro ao buscar parcelas para baixa automática:', err.message);
            db.close();
            return;
        }

        if (parcelas.length === 0) {
            console.log('Nenhuma parcela encontrada para baixa automática.');
            db.close();
            return;
        }

        console.log(`Encontradas ${parcelas.length} parcela(s) para baixa automática:`);
        
        let processadas = 0;
        let sucessos = 0;
        let erros = 0;

        parcelas.forEach((parcela) => {
            console.log(`- ID: ${parcela.id}, Valor: R$ ${parcela.valor.toFixed(2)}, Vencimento: ${parcela.data_vencimento}`);
            
            // Executar baixa automática usando a data de vencimento como data de pagamento
            const sqlUpdate = `
                UPDATE Parcelas 
                SET 
                    status = 'Paga',
                    data_pagamento = data_vencimento,
                    baixa_automatica = 0
                WHERE id = ?
            `;

            db.run(sqlUpdate, [parcela.id], function(err) {
                processadas++;
                
                if (err) {
                    console.error(`Erro ao baixar parcela ID ${parcela.id}:`, err.message);
                    erros++;
                } else {
                    console.log(`✓ Parcela ID ${parcela.id} baixada automaticamente com sucesso!`);
                    sucessos++;
                }

                // Quando todas as parcelas foram processadas
                if (processadas === parcelas.length) {
                    console.log(`\n=== RESUMO DA EXECUÇÃO ===`);
                    console.log(`Total de parcelas processadas: ${processadas}`);
                    console.log(`Sucessos: ${sucessos}`);
                    console.log(`Erros: ${erros}`);
                    console.log(`Processo finalizado em: ${new Date().toISOString()}`);
                    
                    db.close((err) => {
                        if (err) {
                            console.error('Erro ao fechar conexão com o banco:', err.message);
                        } else {
                            console.log('Conexão com o banco fechada.');
                        }
                    });
                }
            });
        });
    });
}

// Executar o script
if (require.main === module) {
    executarBaixaAutomatica();
}

module.exports = { executarBaixaAutomatica };

