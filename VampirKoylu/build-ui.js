const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'game.html');
let html = fs.readFileSync(filePath, 'utf8');

const targetToReplace = `                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div class="form-group" style="margin-bottom: 0; flex: 1;">
                            <label>Vampir Sayısı</label>
                            <input type="number" id="setting-vampires" value="1" min="1" max="4">
                        </div>
                        <div class="form-group" style="margin-bottom: 0; flex: 1;">
                            <label>Tartışma Süresi (Sn)</label>
                            <input type="number" id="setting-discussion-time" value="90" min="30" max="300">
                        </div>
                    </div>

                    <div class="roles-settings-grid custom-scrollbar" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; padding-right: 5px;">
                        
                        <div class="role-category">
                            <h4>😈 Özel Vampirler</h4>
                            <div class="role-checkboxes">
                                <label><input type="checkbox" class="role-toggle" value="DRACULA"> Dracula</label>
                                <label><input type="checkbox" class="role-toggle" value="PROFESYONEL"> Profesyonel</label>
                                <label><input type="checkbox" class="role-toggle" value="ZEHIRLI"> Zehirli</label>
                                <label><input type="checkbox" class="role-toggle" value="VAMPIR_IZCISI"> Vampir İzcisi</label>
                            </div>
                        </div>

                        <div class="role-category">
                            <h4>🛡️ Köylüler (İyiler)</h4>
                            <div class="role-checkboxes">
                                <label><input type="checkbox" class="role-toggle" value="DOKTOR" checked> Doktor</label>
                                <label><input type="checkbox" class="role-toggle" value="GOZCU" checked> Gözcü</label>
                                <label><input type="checkbox" class="role-toggle" value="DEDEKTIF"> Dedektif</label>
                                <label><input type="checkbox" class="role-toggle" value="SERIF"> Şerif</label>
                                <label><input type="checkbox" class="role-toggle" value="POLIS"> Polis</label>
                                <label><input type="checkbox" class="role-toggle" value="IZCI"> İzci</label>
                                <label><input type="checkbox" class="role-toggle" value="TUZAKCI"> Tuzakçı</label>
                                <label><input type="checkbox" class="role-toggle" value="INTIKAMCI"> İntikamcı</label>
                                <label><input type="checkbox" class="role-toggle" value="UYURGEZER"> Uyurgezer</label>
                                <label><input type="checkbox" class="role-toggle" value="DELI"> Deli</label>
                            </div>
                        </div>

                        <div class="role-category">
                            <h4>🎭 Tarafsızlar</h4>
                            <div class="role-checkboxes">
                                <label><input type="checkbox" class="role-toggle" value="SERI_KATIL"> Seri Katil</label>
                                <label><input type="checkbox" class="role-toggle" value="KUNDAKCI"> Kundakçı</label>
                                <label><input type="checkbox" class="role-toggle" value="HIRSIZ"> Hırsız</label>
                                <label><input type="checkbox" class="role-toggle" value="SOYTARI"> Soytarı</label>
                            </div>
                        </div>

                    </div>`;

// Generate Role Counters snippet using a helper function to keep it tidy
function createCounter(name, valueId, defaultVal=0) {
    return `<div class="role-counter-item">
                <span class="role-name">${name}</span>
                <div class="counter-control">
                    <button class="btn-counter btn-minus" data-target="${valueId}">-</button>
                    <span class="role-count" id="${valueId}" data-roleslot="${valueId}">${defaultVal}</span>
                    <button class="btn-counter btn-plus" data-target="${valueId}">+</button>
                </div>
            </div>`;
}

function createCheckbox(name, valueStr) {
    return `<label><input type="checkbox" class="pool-toggle" value="${valueStr}" checked> ${name}</label>`;
}

const vampRoles = [
    {id: 'VAMPIR', name: 'Vampir'},
    {id: 'DRACULA', name: 'Dracula'},
    {id: 'PROFESYONEL', name: 'Profesyonel'},
    {id: 'ZEHIRLI', name: 'Zehirli'},
    {id: 'VAMPIR_IZCISI', name: 'Vampir İzcisi'}
];

const iyiRoles = [
    {id: 'KOYLU', name: 'Köylü'},
    {id: 'DOKTOR', name: 'Doktor'},
    {id: 'GOZCU', name: 'Gözcü'},
    {id: 'DEDEKTIF', name: 'Dedektif'},
    {id: 'SERIF', name: 'Şerif'},
    {id: 'POLIS', name: 'Polis'},
    {id: 'IZCI', name: 'İzci'},
    {id: 'TUZAKCI', name: 'Tuzakçı'},
    {id: 'INTIKAMCI', name: 'İntikamcı'},
    {id: 'UYURGEZER', name: 'Uyurgezer'},
    {id: 'DELI', name: 'Deli'}
];

const tarafsizRoles = [
    {id: 'SERI_KATIL', name: 'Seri Katil'},
    {id: 'KUNDAKCI', name: 'Kundakçı'},
    {id: 'HIRSIZ', name: 'Hırsız'},
    {id: 'SOYTARI', name: 'Soytarı'}
];

let allRolesHtml = '';
vampRoles.forEach(r => allRolesHtml += createCheckbox(r.name, r.id));
iyiRoles.forEach(r => allRolesHtml += createCheckbox(r.name, r.id));
tarafsizRoles.forEach(r => allRolesHtml += createCheckbox(r.name, r.id));

const replacement = `                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                        <div class="form-group" style="margin-bottom: 0; flex: 1;">
                            <!-- Toplam Rol ve Oyuncu Durumu -->
                            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; text-align: center; border: 1px solid var(--btn-secondary-border);">
                                <span style="display: block; font-size: 0.85rem; color: var(--text-muted);">Toplam Slot / Oyuncu</span>
                                <span id="slot-status" style="font-weight: bold; font-size: 1.2rem; color: var(--neon-purple);">0 / 0</span>
                            </div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0; flex: 1;">
                            <label>Tartışma Süresi (Sn)</label>
                            <input type="number" id="setting-discussion-time" value="90" min="30" max="300" style="padding: 10px; width: 100%;">
                        </div>
                    </div>

                    <div class="roles-settings-grid custom-scrollbar" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; padding-right: 5px;">
                        
                        <div class="role-category" style="background: rgba(157,78,221,0.1); padding: 10px; border-radius: 8px;">
                            <h4 style="display: flex; justify-content: space-between; align-items: center; border-bottom: none; margin-bottom: 5px;">
                                <span style="display:flex; align-items:center; gap:8px;">🎲 Rastgele Rol <button id="btn-edit-random-pool" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;">⚙️ Havuz Ayarı</button></span>
                                <div class="counter-control" style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 3px;">
                                    <button class="btn-counter btn-minus" data-target="RASTGELE">-</button>
                                    <span class="role-count" id="RASTGELE" data-roleslot="RASTGELE" style="min-width: 20px; text-align: center; font-weight: bold; display: inline-block;">0</span>
                                    <button class="btn-counter btn-plus" data-target="RASTGELE">+</button>
                                </div>
                            </h4>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Özelleştirilen havuzdan rastgele roller atar.</div>
                        </div>

                        <!-- VAMPİRLER -->
                        <div class="role-category">
                            <h4>😈 Vampirler</h4>
                            <div class="role-counters">
                                ${vampRoles.map(r => createCounter(r.name, r.id, r.id==='VAMPIR'?1:0)).join('')}
                            </div>
                        </div>

                        <!-- İYİLER -->
                        <div class="role-category">
                            <h4>🛡️ Köylüler (İyiler)</h4>
                            <div class="role-counters">
                                ${iyiRoles.map(r => createCounter(r.name, r.id, r.id==='DOKTOR'?1:0)).join('')}
                            </div>
                        </div>

                        <!-- TARAFSIZLAR -->
                        <div class="role-category">
                            <h4>🎭 Tarafsızlar</h4>
                            <div class="role-counters">
                                ${tarafsizRoles.map(r => createCounter(r.name, r.id, 0)).join('')}
                            </div>
                        </div>

                    </div>
                    
                    <!-- Random Pool Modal -->
                    <div id="random-pool-modal" class="hidden" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center;">
                        <div class="card" style="width: 90%; max-width: 450px; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.9); max-height: 90vh; display: flex; flex-direction: column;">
                            <h3 style="color: var(--neon-purple); border-bottom: 1px solid var(--btn-secondary-border); padding-bottom: 10px; margin-bottom: 10px;">🎲 Rastgele Havuzu Ayarı</h3>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 15px;">"Rastgele" seçilen rollerin buradaki işaretli rollerden biri olmasını sağlar.</p>
                            
                            <div class="pool-checkbox-grid custom-scrollbar" style="overflow-y: auto; padding-right: 5px; margin-bottom: 15px; flex: 1;">
                                ${allRolesHtml}
                            </div>
                            
                            <button id="btn-close-random-pool" class="btn btn-primary" style="padding: 12px;">Havuzu Kaydet ve Kapat</button>
                        </div>
                    </div>
                `;

let normalizedHtml = html.replace(/\r\n/g, '\n');
let normalizedTarget = targetToReplace.replace(/\r\n/g, '\n');

if (normalizedHtml.includes(normalizedTarget)) {
    // Inject logic before the end of body or just after host settings
    // Wait, let's inject script logic natively into app.js later.
    // Replace the settings target
    normalizedHtml = normalizedHtml.replace(normalizedTarget, replacement);

    // Write back
    fs.writeFileSync(filePath, normalizedHtml, 'utf8');
    console.log("SUCCESS");
} else {
    console.log("Target not found. Please review the replacement script.");
    const startIdx = normalizedHtml.indexOf('Oyun Ayarları');
    console.log("preview:");
    console.log(normalizedHtml.substring(startIdx, startIdx + 800));
}
