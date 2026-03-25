const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'game.html');
let html = fs.readFileSync(filePath, 'utf8');

const targetToReplace = `                    <div class="settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Vampir Sayısı</label>
                            <input type="number" id="setting-vampires" value="1" min="1" max="4">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Doktor</label>
                            <select id="setting-doctor">
                                <option value="1" selected>Açık</option>
                                <option value="0">Kapalı</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Büyücü</label>
                            <select id="setting-seer">
                                <option value="1" selected>Açık</option>
                                <option value="0">Kapalı</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Tartışma Süresi (Sn)</label>
                            <input type="number" id="setting-discussion-time" value="90" min="30" max="300">
                        </div>
                    </div>`;

const replacement = `                    <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
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

// Normalize line endings to avoid \r\n vs \n issues
const normalizedHtml = html.replace(/\r\n/g, '\n');
const normalizedTarget = targetToReplace.replace(/\r\n/g, '\n');

if (normalizedHtml.includes(normalizedTarget)) {
    const finalHtml = normalizedHtml.replace(normalizedTarget, replacement);
    fs.writeFileSync(filePath, finalHtml, 'utf8');
    console.log("SUCCESS");
} else {
    console.log("Target not found in HTML. Showing a preview of the HTML where it should be:");
    const startIdx = normalizedHtml.indexOf('Oyun Ayarları');
    console.log(normalizedHtml.substring(startIdx, startIdx + 500));
}
