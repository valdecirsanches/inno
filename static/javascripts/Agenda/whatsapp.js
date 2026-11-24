async function EnviaWhatsApp(row) {
    const response = await api.get('/whatsapp/agenda_texto/', { params: { id_consulta: row.id } });
    const data = response.data;
    let timerWA = null;

    if (data.success) {
        let txt = `
        <div id="zoom_overlay_bg_wa" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9998; display: none; backdrop-filter: blur(3px); transition: 0.5s;"></div>

        <div style="display: flex; gap: 20px; font-family: 'Inter', sans-serif; text-align: left; padding: 10px; align-items: stretch; justify-content: center;">
            
            <div id="coluna-esquerda" style="flex: 1; min-width: 380px; max-width: 400px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; background: #f9fbfe; padding: 12px; border-radius: 12px; border: 1px solid #eef2f7;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="position: relative; width: 50px; height: 50px;">
                            <img id="foto_contato_realtime" src="/static/img/default-user.png"
                                 style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; transition: 0.6s; position: relative; z-index: 9999;">
                        </div>
                        <h4 style="margin: 0; font-size: 13px; color: #333; font-weight: 700;">${data.name}</h4>
                    </div>
                </div>

                <textarea id="msg_whatsapp_manual" class="form-control" 
                        style="width: 100%; height: 110px; padding: 10px; border-radius: 8px; border: 1px solid #ffe58f; background: #fffbe6; font-size: 12px; color: #856404; line-height: 1.4; resize: none;">${data.success}</textarea>
                
                <div style="position: relative;">
                    <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #1c84c6; font-weight: bold;">+55</span>
                    <input id="id_celular_agenda" class="form-control" value="${row.cel || data.celular}" 
                           style="width: 100%; padding: 10px 10px 10px 45px; border-radius: 8px; border: 1px solid #e7eaec; font-size: 16px; font-weight: 600;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button type="button" id="btn-envia-wa" class="btn-modern">
                        <i class="fa fa-whatsapp" style="color: #25D366; font-size: 18px;"></i>
                        <div style="text-align: left"><strong>Enviar WhatsApp</strong></div>
                    </button>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button type="button" id="btn-confirma" class="btn-modern" style="border-left-color: #1ab394;"><strong>Confirmar</strong></button>
                        <button type="button" id="btn-cancela" class="btn-modern" style="border-left-color: #ed5565;"><strong>Cancelar</strong></button>
                    </div>
                    <button type="button" id="id-btn-sair" class="btn-modern" style="border-left-color: #ced4da;"><strong>Voltar</strong></button>
                </div>
                <div id="fallback-status" style="margin-top: 10px;"></div>
            </div>

            <div id="coluna-qrcode" style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8f9fa; padding: 20px; border-radius: 12px; border: 1px solid #eee;">
                <div id="status-header" style="text-align: center; margin-bottom: 15px; width: 100%;">
                    <b style="color: #1c84c6; font-size: 11px; text-transform: uppercase;">Status da Conexão</b><br>
                    <small id="label_host1" style="color: #666; font-size: 14px; word-break: break-all;">Verificando...</small>
                </div>
                <div id="id-qrcode" style="width: 260px; height: 260px; background: white; border: 1px solid #ddd; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 10px;">
                    <i class="fa fa-qrcode fa-4x" style="color: #eee;"></i>
                </div>
                <div id="instrucao-qr" style="margin-top: 15px; color: #888; font-size: 11px;">
                    <i class="fa fa-camera"></i> Escaneie o código acima
                </div>
            </div>
        </div>

        <style>
            .btn-modern { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e7eaec; border-left: 5px solid #25D366; border-radius: 8px; background: #fff; cursor: pointer; width: 100%; transition: 0.2s; }
            .btn-modern:hover { background: #f9f9f9; transform: translateX(3px); }
            .btn-modern strong { font-size: 12px; color: #555; }
            #id-qrcode img, #id-qrcode canvas { max-width: 100% !important; height: auto !important; display: block !important; }
            .swal2-popup { border-radius: 15px !important; padding: 10px !important; }
            /* CLASSE DO ZOOM */
            .foto-zoom-ativa-wa { border-radius: 8px !important; box-shadow: 0 20px 80px rgba(0,0,0,0.8) !important; z-index: 10000 !important; }
        </style>
        `;

        swal({
            html: txt,
            width: '820px', 
            showConfirmButton: false,
            onOpen: (modal) => {
                const foto = modal.querySelector('#foto_contato_realtime');
                const overlay = modal.querySelector('#zoom_overlay_bg_wa');
                const colQr = modal.querySelector('#coluna-qrcode');
                const labelHost = modal.querySelector('#label_host1');
                const statusHeader = modal.querySelector('#status-header');
                const fallback = modal.querySelector('#fallback-status');
                const containerQr = modal.querySelector('#id-qrcode');

                // 1. CARREGA FOTO
                buscaFotoRealtime('#foto_contato_realtime', row.cel || data.celular);

                // 2. LÓGICA DE ESTICAR A FOTO (ZOOM)
                if (foto) {
                    foto.onclick = function() {
                        const ativo = this.classList.toggle('foto-zoom-ativa-wa');
                        if (ativo) {
                            const rect = this.getBoundingClientRect();
                            const moveX = (window.innerWidth / 2) - (rect.left + rect.width / 2);
                            const moveY = (window.innerHeight / 2) - (rect.top + rect.height / 2);
                            this.style.transform = `translate(${moveX}px, ${moveY}px) scale(7)`;
                            overlay.style.display = 'block';
                        } else {
                            this.style.transform = `translate(0, 0) scale(1)`;
                            overlay.style.display = 'none';
                        }
                    };
                    overlay.onclick = () => foto.click();
                }

                // 3. MONITORAMENTO DO QR CODE
                const ajustarLayout = () => {
                    if (colQr.style.display !== 'none') {
                        colQr.style.display = 'none';
                        modal.style.width = '450px';
                        fallback.appendChild(statusHeader);
                        labelHost.innerHTML = `<i class="fa fa-check-circle" style="color:#1ab394;"></i> Conectado à ${data.host_ident}`;
                    }
                };

                const wa = data.whatsapp_status;
                if (wa && wa.status === 'SCAN_QR_CODE') {
                    containerQr.innerHTML = '';
                    ReadQRCode2(containerQr, wa.host, wa.session);
                } else { ajustarLayout(); }

                timerWA = setInterval(async () => {
                    try {
                        const check = await api.get('/whatsapp/agenda_texto/', { params: { id_consulta: row.id } });
                        if (check.data.whatsapp_status?.status === 'WORKING' || check.data.whatsapp_status?.status === 'CONNECTED') {
                            ajustarLayout();
                            clearInterval(timerWA);
                        }
                    } catch (e) {}
                }, 3000);

                // 4. BOTÕES
                modal.querySelector('#btn-envia-wa').onclick = () => {
                    const cel = modal.querySelector('#id_celular_agenda').value;
                    const msg = modal.querySelector('#msg_whatsapp_manual').value;
                    executarAcaoFinal('whatsapp', { id: row.id, celular: cel, mensagem: msg });
                    swal.close();
                };
                modal.querySelector('#btn-confirma').onclick = () => { executarAcaoFinal('confirmado', row); swal.close(); };
                modal.querySelector('#btn-cancela').onclick = () => { executarAcaoFinal('cancelado', row); swal.close(); };
                modal.querySelector('#id-btn-sair').onclick = () => swal.close();


                // modal.querySelector('#id-btn-sair').onclick = () => { clearInterval(timerWA); swal.close(); };
                // modal.querySelector('#btn-envia-wa').onclick = () => { /* sua logica de envio */ clearInterval(timerWA); swal.close(); };

                // modal.addEventListener('dispose', () => clearInterval(timerWA));
            },

            onClose: () => { 
                if (timerWA) {
                    clearInterval(timerWA); 
                    timerWA = null; 
                }
            }

            
            
        });
    }
}

function executarAcaoFinal(acao, row) {
    const urlAcao = acao === 'whatsapp' ? '/api/whatsapp/EnviaWhatsApp/' : 'RestauraAgendamento/';
    const dados = acao === 'whatsapp' ? 
        { id_consulta: row.id, celular: $('#id_celular_agenda').val() } : 
        { id_consulta: row.id, acao: acao };

    // Aviso de "Processando"
    swal({
        title: 'Aguarde...',
        text: 'Estamos processando sua solicitação',
        allowOutsideClick: false,
        onOpen: () => { swal.showLoading(); }
    });

    $.ajax({
        url: urlAcao,
        method: "POST",
        data: dados,
        success: function(res) {
            console.log("Resposta do servidor:", res)
            swal.close(); // Fecha o carregando
            
            if (res.success) {
                // Aviso de Sucesso Bonitinho
                swal({
                    title: 'Sucesso!',
                    text: res.message || 'Operação realizada com sucesso.',
                    type: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
                
                if(typeof AtualizaTabela === 'function') AtualizaTabela();
            } else {
                // Aviso de Erro que veio do Python
                if (acao === 'whatsapp') ConfereConexaoAposErro(row, res.error);
                else swal('Erro no Envio', res.error || 'Ocorreu um erro inesperado.', 'error');
            }
        },
        error: function(xhr) {
            swal.close();
            let erroMsg = 'Erro técnico no servidor.';
            if(xhr.responseJSON && xhr.responseJSON.error) erroMsg = xhr.responseJSON.error;
            
            swal('Falha Crítica', erroMsg, 'error');
        }
    });
}

// Falhou o envio: a conexão pode ter caído depois que a janela abriu
// (a instância volta para "connecting"/QR). Confere de novo e, se pedir
// leitura do QR Code, reabre a janela do WhatsApp já com o QR na tela.
async function ConfereConexaoAposErro(row, erro) {
    let wa = null;
    try {
        const r = await api.get('/whatsapp/agenda_texto/', { params: { id_consulta: row.id, _ts: Date.now() } });
        wa = r.data && r.data.whatsapp_status;
    } catch (e) { wa = null; }
    if (wa && wa.status === 'SCAN_QR_CODE') {
        swal({
            title: 'WhatsApp desconectado',
            html: 'A conexão com o WhatsApp caiu e precisa ser refeita.<br>Leia o QR Code na próxima tela e envie de novo.',
            type: 'warning',
            confirmButtonText: 'Mostrar QR Code'
        }).then(function () { EnviaWhatsApp(row); }, function () {});
        return;
    }
    swal('Erro no Envio', erro || 'Ocorreu um erro inesperado.', 'error');
}

function Mostrar_texto_whatsapp(){
    if ($("#id__texto_whatsapp").hasClass("hide")){
        $("#id__texto_whatsapp").removeClass("hide")
    } else {
        $("#id__texto_whatsapp").addClass("hide")
    }
}


function Acao(e){
    var acao = e.value;
    if (acao==='whatsapp') {
        $('#id_envia_whatsapp').removeClass('hidden')
    } else {
        $('#id_envia_whatsapp').addClass('hidden')
    }
}




function Mostrar_texto_whatsapp(){
    if ($("#id__texto_whatsapp").hasClass("hide")){
        $("#id__texto_whatsapp").removeClass("hide")
    } else {
        $("#id__texto_whatsapp").addClass("hide")
    }
}


function Acao(e){
    var acao = e.value;
    if (acao==='whatsapp') {
        $('#id_envia_whatsapp').removeClass('hidden')
    } else {
        $('#id_envia_whatsapp').addClass('hidden')
    }
}


function WhatsAppInfo(row) {
    var txt =`  
            <div>
                <label>Informe o celular a ser verificado</label>
                <input id="id_celular_agenda" class="text-center celular" value="${row.cel}"/>
            </div>` ;
    swal({
        title: "Verifica se celular tem WhatsApp:",
        html: txt,
        type: "info",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Verificar",
        cancelButtonText: "Desistir!",
        closeOnConfirm: true
    }).then(function (isConfirm) {
        if (isConfirm) {
            $.ajax({
                url: '/api/whatsapp/info/',
                method: "POST",
                data: {
                    celular: $('#id_celular_agenda').val() || '0',
                    id_consulta: row.id
                },
            }).success( function Ret(data) {
                if (data.success) {
                    const NOME = data.success.pushname || data.success.name || '(Restrito)';
                    swal({
                        title: `<span style="color: blue">${data.success.info}</span><br>
                                <span style="color: #6c757b">${NOME}</span>`,
                        html: `<img src="${data.success.profilePicUrl}" style="width:300px;">`,
                        type: 'success',
                    });
                } else {
                    swal(`<span style="color: #bd2130">${data.error}</span>`, 'Verificação retornou negativo!', 'error');
                }
            });
        }
    });
}

async function Restaura(row) {
    const response = await api.get('/whatsapp/agenda_texto/', { params: { id_consulta: row.id } });
    const data = response.data;

    let txt = `
    <div id="zoom_overlay_bg" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9998; display: none; backdrop-filter: blur(3px); transition: 0.5s;"></div>
    
    <div style="display: flex; gap: 20px; font-family: 'Inter', sans-serif; text-align: left; padding: 10px; align-items: stretch;">
        
        <div id="coluna-esquerda-restaura" style="flex: 1; min-width: 380px; max-width: 400px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: #f9fbfe; padding: 12px; border-radius: 12px; border: 1px solid #eef2f7;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="position: relative; width: 50px; height: 50px;">
                        <img id="foto-paciente-zoom" src="${data.picture || '/static/img/default-user.png'}" 
                             style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; transition: 0.6s; position: relative; z-index: 9999;">
                        <span id="status_realtime" style="position: absolute; bottom: -2px; right: -2px; font-size: 8px; padding: 2px 5px; color: #fff; border-radius: 10px; background: #1ab394; font-weight: bold; border: 1px solid #fff; z-index: 11;">On</span>
                    </div>
                    <h4 style="margin: 0; font-size: 13px; color: #333; font-weight: 700;">${data.name || row.pac}</h4>
                </div>
                <img src="${data.logo}" style="max-height: 30px; width: auto; opacity: 0.7;">
            </div>

            <div style="margin: 5px 0; font-size: 10px; font-weight: bold; color: #999; text-transform: uppercase; letter-spacing: 1px;">Escolha uma ação:</div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
                <button type="button" id="btn-restaura-orig" class="btn-modern-action" style="border-left: 5px solid #1c84c6;">
                    <i class="fa fa-history" style="color: #1c84c6;"></i>
                    <div style="text-align: left"><strong>Situação Original</strong><span>Restaurar status inicial</span></div>
                </button>
                <button type="button" id="btn-restaura-conf" class="btn-modern-action" style="border-left: 5px solid #1ab394;">
                    <i class="fa fa-check-circle" style="color: #1ab394;"></i>
                    <div style="text-align: left"><strong>Confirmar Presença</strong><span>Confirmar para consulta</span></div>
                </button>
                <button type="button" id="btn-restaura-canc" class="btn-modern-action" style="border-left: 5px solid #ed5565;">
                    <i class="fa fa-times-circle" style="color: #ed5565;"></i>
                    <div style="text-align: left"><strong>Cancelar Consulta</strong><span>Remover agendamento</span></div>
                </button>
                <button type="button" id="btn-restaura-sair" class="btn-modern-action" style="border-left: 5px solid #ced4da; background: #f8f9fa;">
                    <i class="fa fa-arrow-left" style="color: #6c757d;"></i>
                    <strong style="color: #6c757d;">Desistir / Voltar</strong>
                </button>
            </div>
            <div id="fallback-status-restaura" style="margin-top: 10px;"></div>
        </div>

        <div id="coluna-qrcode-restaura" style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8f9fa; padding: 20px; border-radius: 12px; border: 1px solid #eee;">
            <div id="status-header-restaura" style="text-align: center; margin-bottom: 15px; width: 100%;">
                <b style="color: #1c84c6; font-size: 11px; text-transform: uppercase;">Status da Conexão</b><br>
                <small id="label_host" style="color: #666; font-size: 10px;">Verificando...</small>
            </div>
            <div id="id-qrcode-restaura" style="width: 260px; height: 260px; background: white; border: 1px solid #ddd; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 10px; box-shadow: inset 0 0 5px rgba(0,0,0,0.05);">
                <i class="fa fa-qrcode fa-4x" style="color: #eee;"></i>
            </div>
            <div id="instrucao-qr" style="margin-top: 15px; color: #888; font-size: 11px;">
                <i class="fa fa-camera"></i> Escaneie o código acima
            </div>
        </div>
    </div>

    <style>
        .btn-modern-action { display: flex; align-items: center; gap: 12px; padding: 10px 15px; border: 1px solid #e7eaec; border-radius: 8px; background: #fff; cursor: pointer; transition: 0.2s; width: 100%; outline: none; }
        .btn-modern-action:hover { background: #fdfdfd; transform: translateX(4px); }
        .btn-modern-action strong { font-size: 12px; color: #444; display: block; }
        .btn-modern-action span { font-size: 10px; color: #999; }
        #id-qrcode-restaura img, #id-qrcode-restaura canvas { max-width: 100% !important; height: auto !important; display: block !important; }
        .swal2-popup { border-radius: 15px !important; padding: 10px !important; }
    </style>
    `;

    swal({
        html: txt,
        width: '820px', 
        showConfirmButton: false,
        onOpen: (modal) => {
            const colQr = modal.querySelector('#coluna-qrcode-restaura');
            const labelHost = modal.querySelector('#label_host');
            const statusHeader = modal.querySelector('#status-header-restaura');
            const fallback = modal.querySelector('#fallback-status-restaura');
            const containerQr = modal.querySelector('#id-qrcode-restaura');
            
            labelHost.innerText = data.host_ident || '---';

            // FUNÇÃO PARA AJUSTAR O LAYOUT QUANDO CONECTAR
            const ajustarLayoutConectado = () => {
                if (colQr.style.display !== 'none') {
                    colQr.style.display = 'none';
                    modal.style.width = '450px';
                    fallback.appendChild(statusHeader);
                    labelHost.innerHTML = `<i class="fa fa-check-circle" style="color:#1ab394;"></i> Conectado a ${data.host_ident}`;
                }
            };

            // INICIALIZAÇÃO
            if (data.whatsapp_status && data.whatsapp_status.status === 'SCAN_QR_CODE') {
                containerQr.innerHTML = '';
                ReadQRCode2(containerQr, data.whatsapp_status.host, data.whatsapp_status.session);
            } else {
                ajustarLayoutConectado();
            }

            // MONITORAMENTO EM TEMPO REAL
            console.log("CRIANDO TIMER");
            const checkStatus = setInterval(async () => {
                try {
                    const check = await api.get('/whatsapp/agenda_texto/', { params: { id_consulta: row.id } });
                    const currentStatus = check.data.whatsapp_status;
                    console.log("CONSULTANDO STATUS");
                    if (currentStatus && (currentStatus.status === 'CONNECTED' || currentStatus.status === 'WORKING')) {
                        ajustarLayoutConectado();
                        clearInterval(checkStatus); // Para de perguntar ao servidor
                    }
                } catch (e) { console.error("Erro no monitoramento", e); }
            }, 3000); // Checa a cada 3 segundos

            // Limpa o interval se o usuário fechar o modal manualmente
            modal.addEventListener('dispose', () => clearInterval(checkStatus));

            // ... (Restante das funções de Zoom e Clique permanecem as mesmas)
            const foto = modal.querySelector('#foto-paciente-zoom');
            const overlay = modal.querySelector('#zoom_overlay_bg');
            if (foto) {
                foto.onclick = function() {
                    const estaAtivo = this.classList.toggle('foto-zoom-ativa');
                    if (estaAtivo) {
                        const rect = this.getBoundingClientRect();
                        const moveX = (window.innerWidth / 2) - (rect.left + rect.width / 2);
                        const moveY = (window.innerHeight / 2) - (rect.top + rect.height / 2);
                        this.style.transform = `translate(${moveX}px, ${moveY}px) scale(7)`;
                        overlay.style.display = 'block';
                    } else {
                        this.style.transform = `translate(0, 0) scale(1)`;
                        overlay.style.display = 'none';
                    }
                };
            }
            overlay.onclick = () => foto.click();

            const executar = async (acao) => {
                clearInterval(checkStatus);
                swal.showLoading();
                const res = await $.post('RestauraAgendamento/', { id_consulta: row.id, acao: acao });
                if (res.success) {
                    swal.close();
                    toastr.success('Agendamento atualizado!');
                    if (typeof AtualizaTabela === 'function') AtualizaTabela();
                } else { swal('Ops!', res.error, 'error'); }
            };

            modal.querySelector('#btn-restaura-orig').onclick = () => executar('original');
            modal.querySelector('#btn-restaura-conf').onclick = () => executar('confirmado');
            modal.querySelector('#btn-restaura-canc').onclick = () => executar('cancelado');
            modal.querySelector('#btn-restaura-sair').onclick = () => { clearInterval(checkStatus); swal.close(); };
            buscaFotoRealtime('#foto-paciente-zoom', data.celular || row.cel || "");
        },
        onClose: () => {
            // Garante que o timer pare se o modal fechar de qualquer forma
            if (typeof checkStatus !== 'undefined') clearInterval(checkStatus);
        }
    });
}