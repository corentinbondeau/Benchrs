// ==UserScript==
// @name         Benchrs - Import FFF epreuves
// @namespace    http://benchrs.app/
// @version      1.0.0
// @description  Importer les matchs depuis epreuves.fff.fr vers Benchrs sans coller de JSON
// @author       Benchrs
// @match        https://epreuves.fff.fr/*
// @match        https://*.fff.fr/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    
    const STORAGE_KEY = 'benchrs_fff_import_config';
    
    function getConfig() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    }
    
    function setConfig(config) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch {}
    }
    
    function createButton() {
        const config = getConfig();
        if (!config || !config.teamId || !config.cpNo) {
            // Show config button
            const btn = document.createElement('button');
            btn.textContent = '⚙️ Configurer Benchrs';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                background: #004687;
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: system-ui, sans-serif;
                font-size: 14px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            `;
            btn.onclick = showConfig;
            document.body.appendChild(btn);
            return;
        }
        
        const btn = document.createElement('button');
        btn.textContent = '📥 Envoyer vers Benchrs';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            background: #0066cc;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: system-ui, sans-serif;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        btn.onclick = () => importToBenchrs(config);
        document.body.appendChild(btn);
    }
    
    function showConfig() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; font-family: system-ui, sans-serif;">
                <h2 style="margin: 0 0 20px 0; color: #004687;">Configurer Benchrs</h2>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #666;">
                    Copiez ces informations depuis la page Championnat de Benchrs (Import DOFA)
                </p>
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">URL Benchrs</label>
                <input id="benchrs-url" type="text" value="${window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'https://votre-app.benchrs.fr'}" style="width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Team ID</label>
                <input id="team-id" type="text" placeholder="uuid de l'équipe" style="width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Compétition (cpNo)</label>
                <input id="cp-no" type="number" placeholder="452059" style="width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Phase</label>
                <input id="phase" type="number" placeholder="1" style="width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Poule</label>
                <input id="poule" type="number" placeholder="1" style="width: 100%; padding: 8px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box;">
                <div style="display: flex; gap: 10px;">
                    <button id="save-config" style="flex: 1; background: #0066cc; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer;">Enregistrer</button>
                    <button id="cancel-config" style="flex: 1; background: #f0f0f0; border: 1px solid #ddd; padding: 10px; border-radius: 4px; cursor: pointer;">Annuler</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('save-config').onclick = () => {
            const config = {
                baseUrl: document.getElementById('benchrs-url').value,
                teamId: document.getElementById('team-id').value,
                cpNo: parseInt(document.getElementById('cp-no').value),
                phase: parseInt(document.getElementById('phase').value),
                poule: parseInt(document.getElementById('poule').value)
            };
            setConfig(config);
            modal.remove();
            location.reload();
        };
        
        document.getElementById('cancel-config').onclick = () => {
            modal.remove();
        };
    }
    
    async function importToBenchrs(config) {
        const btn = document.querySelector('button[style*="Envoyer vers Benchrs"]');
        if (btn) {
            btn.textContent = '⏳ Extraction...';
            btn.disabled = true;
        }
        
        try {
            // Try to find JSON data in the page
            let matchesData = null;
            
            // Check if there's a preloaded data script
            const scripts = document.querySelectorAll('script');
            for (let script of scripts) {
                const content = script.textContent;
                if (content && (content.includes('hydra:member') || content.includes('"ma_no"'))) {
                    try {
                        // Try to extract JSON
                        const match = content.match(/\[.*\{.*"ma_no".*\}.*\]/s) || content.match(/\{.*"hydra:member".*\}/s);
                        if (match) {
                            const parsed = JSON.parse(match[0]);
                            matchesData = Array.isArray(parsed) ? parsed : parsed['hydra:member'];
                            break;
                        }
                    } catch {}
                }
            }
            
            // If not found in scripts, try to fetch the current page's data
            if (!matchesData) {
                // Try common API endpoints
                const url = window.location.href;
                try {
                    const resp = await fetch(url, { credentials: 'include' });
                    const text = await resp.text();
                    const jsonMatch = text.match(/\[.*\{.*"ma_no".*\}.*\]/s) || text.match(/\{.*"hydra:member".*\}/s);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        matchesData = Array.isArray(parsed) ? parsed : parsed['hydra:member'];
                    }
                } catch {}
            }
            
            if (!matchesData || !Array.isArray(matchesData) || matchesData.length === 0) {
                alert('Aucun match trouvé sur cette page. Allez dans "Tous les matchs" ou "Résultats" puis réessayez.');
                if (btn) {
                    btn.textContent = '📥 Envoyer vers Benchrs';
                    btn.disabled = false;
                }
                return;
            }
            
            if (btn) btn.textContent = '⏳ Envoi...';
            
            const response = await fetch(`${config.baseUrl}/api/championships/import-from-epreuves`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    teamId: config.teamId,
                    cpNo: config.cpNo,
                    phase: config.phase,
                    poule: config.poule,
                    matches: matchesData
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                alert(`✅ Import réussi !\n${result.imported} nouveaux matchs, ${result.updated} mis à jour`);
                if (btn) {
                    btn.textContent = '✅ Importé';
                    setTimeout(() => {
                        btn.textContent = '📥 Envoyer vers Benchrs';
                        btn.disabled = false;
                    }, 3000);
                }
            } else {
                alert('❌ Erreur: ' + (result.error || 'Erreur inconnue'));
                if (btn) {
                    btn.textContent = '📥 Envoyer vers Benchrs';
                    btn.disabled = false;
                }
            }
        } catch (error) {
            alert('❌ Erreur: ' + error.message);
            if (btn) {
                btn.textContent = '📥 Envoyer vers Benchrs';
                btn.disabled = false;
            }
        }
    }
    
    // Create button after page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createButton);
    } else {
        createButton();
    }
})();
