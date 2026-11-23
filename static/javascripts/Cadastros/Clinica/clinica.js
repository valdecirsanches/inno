function FechaClinica(){
    $('#id_TelaClinica').addClass('hidden');
}

var $tableClinica = $('#tabelaClinica');

function rowStyle(row, index) {
    return {
        classes: 'ATENDIDO'
    }
}

$tableClinica.on('dbl-click-row.bs.table', function (e, row) {
    ReadClinica(row);
});


function OpcoesClinica(value, row, index) {
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados da clínica">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir clínica">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventsClinica = {
    'click .edit': function (e, value, row) {
        ReadClinica(row);
    },
    'click .add': function (e, value, row) {
        AddClinica(row.id);
    },
    'click .access': function (e, value, row) {
        // {#Permissao(row.id);#}
    },
    'click .del': function (e, value, row) {
        DelClinica(row.id);
    }
};

function AddClinica(){
    $('.classClinica input').val('');
    $('.classClinica textarea').val('');
    if (typeof MostraProvedorWhatsapp === 'function') MostraProvedorWhatsapp('waha', true);
    $('#id_TelaClinica').removeClass('hidden');
    $('.classClinica #id_nome').focus();
}



function ReadClinica(row) {
    $('#id_TelaClinica').removeClass('hidden');
    for (const [key, value] of Object.entries(row)) {
        if ((value === 'None') || (value === null)) {$('.classClinica #id_' + key).val('');}
        else if (value.toString() === 'true') {$('.classClinica #id_'+key).prop('checked', true)}
        else if (value.toString() === 'false') {$('.classClinica #id_' + key).prop('checked', false)}
        else {$('.classClinica #id_' + key).val(value)}
    }
    $('.classClinica #id_nome').focus();
    CarregaProvedorWhatsapp(row.id);
}

// ---------------------------------------------------------------------------
// Servidor do WhatsApp da clínica: WAHA ou Evolution API.
// Só o superusuário e o administrador trocam (o servidor também confere).
// ---------------------------------------------------------------------------
var whatsappProvedor = 'waha';

function MostraProvedorWhatsapp(provedor, disponivel) {
    whatsappProvedor = provedor === 'evolution' ? 'evolution' : 'waha';
    var nome = whatsappProvedor === 'evolution' ? 'Evolution API' : 'WAHA';
    $('#whatsapp_provedor').val(whatsappProvedor);
    $('#whatsapp_provedor_txt').val(nome);
    $('#whatsapp_provedor option[value=evolution]').prop('disabled', !disponivel && whatsappProvedor !== 'evolution');
    var ajuda = whatsappProvedor === 'evolution'
        ? 'Usa o servidor da Evolution API configurado no sistema (.env).'
        : (disponivel ? '' : 'Evolution API não configurada no servidor.');
    $('#whatsapp_provedor_ajuda').text(ajuda);
}

function CarregaProvedorWhatsapp(idClinica) {
    MostraProvedorWhatsapp('waha', true);
    if (!(parseInt(idClinica, 10) > 0)) return;
    $.get('/api/whatsapp/provedor/', { id_clinica: idClinica }, function (r) {
        MostraProvedorWhatsapp(r.provedor, r.evolutionDisponivel);
    });
}

function TrocaProvedorWhatsapp(provedor) {
    var id = $('.classClinica #id_id').val() || 0;
    var anterior = whatsappProvedor;
    if (!(parseInt(id, 10) > 0)) {
        toastr.warning('Salve a clínica antes de escolher o servidor do WhatsApp.');
        $('#whatsapp_provedor').val(anterior);
        return;
    }
    $.ajax({
        url: '/api/whatsapp/provedor/',
        type: 'POST',
        data: { id_clinica: id, provedor: provedor },
        headers: { 'X-CSRFToken': (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '' },
    }).done(function (r) {
        MostraProvedorWhatsapp(r.provedor, true);
        toastr.success('Agora a clínica usa ' + (r.provedor === 'evolution' ? 'a Evolution API' : 'o WAHA') +
            '. Conecte pelo QR Code se ainda não estiver conectado.', 'Servidor do WhatsApp');
    }).fail(function (x) {
        $('#whatsapp_provedor').val(anterior);
        swal('Servidor do WhatsApp', (x.responseJSON && x.responseJSON.error) || 'Não foi possível trocar o servidor.', 'error');
    });
}

// Evita que cliques repetidos em "Salvar" criem a mesma clínica duas vezes.
var salvandoClinica = false;

function SalvaClinica() {
    if (salvandoClinica) {
        return;
    }
    salvandoClinica = true;
    $('#btnSalvaPlano').prop('disabled', true);

    var id = $('.classClinica #id_id').val() || 0;
    var nova = !(parseInt(id, 10) > 0);
    $.ajax({
        url: 'clinica.json',
        data: {
            form: $('.classClinica').serialize(true),
            id: $('.classClinica #id_id').val() || '0'
        },
        type: 'POST',
    }).success(function Ret(data) {
        if (data.success) {
            var row=data.success;
            if (nova) {
                // $tableClinica.bootstrapTable('insertRow', {id: row.id, row: row});
                $tableClinica.bootstrapTable('refresh');
            } else {
                $tableClinica.bootstrapTable('updateByUniqueId', {id: row.id, row: row});
            }
            // A clínica continua aberta após salvar. Guarda o id devolvido pelo
            // servidor para que o próximo "Salvar" atualize esta mesma clínica
            // (sem isso, uma clínica recém-criada seria criada de novo).
            $('.classClinica #id_id').val(row.id);
            toastr.success('Dados salvos com sucesso!', 'Gravando dados do Clinica.');
        }
        else {
            swal('Salvando dados de Clinica', data.error, 'error');
        }
    }).always(function () {
        salvandoClinica = false;
        $('#btnSalvaPlano').prop('disabled', false);
    });
}

function DelClinica(id) {
    swal({
        title: $('.classClinica #id_nome').val(),
        text: "Todos os dados cadastrais da Clinica serão excluídos!",
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir!",
        cancelButtonText: "Não",
    }).then( function () {
        $.ajax({
            url: 'clinica.json',
            data: {id: id},
            type: 'DELETE',
        }).success(function Ret(data) {
            if (data.success) {
                $tableClinica.bootstrapTable('removeByUniqueId', id);
                toastr.success('Excluido com sucesso', 'Exclusão de Clinica.');
            } else {
                toastr.error('Erro ao excluir o Clinica', 'Exclusão de Clinica. Nada feito!');
            }
        });
    });
}



// ---------------------------------------------------------------------------
// Botão "Webhook": mostra para onde o servidor do WhatsApp manda as respostas
// dos pacientes, o que está gravado nele e a última resposta que chegou.
// ---------------------------------------------------------------------------
function _escWebhook(t) {
    return String(t === null || t === undefined ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _htmlWebhook(r) {
    var linha = function (rotulo, valor) {
        return '<tr><th style="padding:4px 10px 4px 0;white-space:nowrap;vertical-align:top;">' + rotulo +
            '</th><td style="padding:4px 0;word-break:break-all;">' + valor + '</td></tr>';
    };
    var ns = r.no_servidor || {};
    var gravado;
    if (ns.erro) {
        gravado = '<span style="color:#c0392b;">' + _escWebhook(ns.erro) + '</span>';
    } else if (r.provedor === 'evolution') {
        gravado = ns.url
            ? _escWebhook(ns.url) + '<br><small>' + (ns.enabled ? 'ativo' : '<b style="color:#c0392b;">desativado</b>') +
              ' · eventos: ' + _escWebhook((ns.events || []).join(', ') || 'nenhum') + '</small>'
            : '<span style="color:#c0392b;">nenhum webhook gravado na instância</span>';
    } else {
        var g = ns.webhooks || [];
        gravado = g.length
            ? g.map(function (x) { return _escWebhook(x.url) + ' <small>(' + _escWebhook((x.events || []).join(', ')) + ')</small>'; }).join('<br>')
            : '<span style="color:#c0392b;">nenhum webhook na sessão do WAHA</span>';
    }
    var ultimo = r.ultimo_recebido
        ? _escWebhook(r.ultimo_recebido.dh) + ' · ' + _escWebhook(r.ultimo_recebido.evento) + ' (' + _escWebhook(r.ultimo_recebido.servidor) + ', sessão ' + _escWebhook(r.ultimo_recebido.sessao) + ')'
        : 'nenhuma ainda';
    var situacao = r.confere
        ? '<div style="padding:8px;border-radius:6px;background:#e8f8f0;color:#1e7e4a;">Configurado corretamente.</div>'
        : '<div style="padding:8px;border-radius:6px;background:#fdecea;color:#a93226;">O webhook gravado no servidor não é o esperado: as respostas dos pacientes não vão chegar.' +
          (r.podeAplicar ? ' Use "Aplicar no servidor".' : '') + '</div>';
    var botoes = '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
        (r.podeAplicar ? '<button type="button" class="btn btn-sm btn-primary" onclick="AplicaWebhookWhatsapp()">Aplicar no servidor</button>' : '') +
        '<button type="button" class="btn btn-sm btn-default" onclick="TestaWebhookWhatsapp()">Testar o endereço</button>' +
        '</div><div id="webhook_teste_resultado" style="margin-top:8px;font-size:13px;"></div>';
    return situacao + '<table style="margin-top:10px;text-align:left;font-size:13px;width:100%;">' +
        linha('Servidor', (r.provedor === 'evolution' ? 'Evolution API' : 'WAHA') + ' · ' + _escWebhook(r.servidor)) +
        linha('Sessão / instância', _escWebhook(r.sessao || '(sem ID da sessão)') + (r.estado ? ' · ' + _escWebhook(r.estado) : '')) +
        linha('Webhook esperado', _escWebhook(r.webhook_esperado)) +
        linha('Gravado no servidor', gravado) +
        linha('Última resposta recebida', ultimo) +
        '</table>' + _htmlRecebidas(r.recebidas || []) + botoes;
}

// as últimas mensagens que chegaram no webhook e o que o sistema fez com cada uma
function _htmlRecebidas(lista) {
    if (!lista.length) return '';
    var explica = function (r) {
        if (!r) return '<span style="color:#888;">sem resultado gravado</span>';
        if (r.acao) return '<span style="color:#1e7e4a;">' + _escWebhook(r.acao) + ' da consulta ' + _escWebhook(r.consulta) +
            (r.retorno_enviado ? ' (retorno enviado ao paciente)' : ' (<b>retorno ao paciente não saiu</b>)') + '</span>';
        if (r.error === 'Contexto não encontrado') return '<span style="color:#a93226;">Nenhum lembrete pendente para este número' +
            (r.telefones && r.telefones.length ? ' (' + _escWebhook(r.telefones.join(', ')) + ')' : ' (o WhatsApp não informou o telefone)') + '</span>';
        return '<span style="color:' + (r.success === false ? '#a93226' : '#666') + ';">' + _escWebhook(r.error || r.info || r.message || JSON.stringify(r)) + '</span>';
    };
    return '<div style="margin-top:12px;text-align:left;font-size:12px;"><b>Últimas mensagens recebidas</b>' +
        '<table style="width:100%;margin-top:4px;border-collapse:collapse;">' +
        lista.map(function (e) {
            return '<tr style="border-top:1px solid #eee;"><td style="padding:3px 6px 3px 0;white-space:nowrap;vertical-align:top;">' + _escWebhook(e.dh) +
                '</td><td style="padding:3px 6px;vertical-align:top;word-break:break-all;">' + _escWebhook(e.de) + '<br><i>"' + _escWebhook(e.texto) + '"</i></td>' +
                '<td style="padding:3px 0;vertical-align:top;">' + explica(e.resultado) + '</td></tr>';
        }).join('') + '</table></div>';
}

function _idClinicaWebhook() {
    var id = $('.classClinica #id_id').val() || 0;
    if (!(parseInt(id, 10) > 0)) {
        toastr.warning('Salve a clínica antes de conferir o webhook.');
        return 0;
    }
    return id;
}

function ConfereWebhookWhatsapp() {
    var id = _idClinicaWebhook();
    if (!id) return;
    $.get('/api/whatsapp/webhook/', { id_clinica: id }).done(function (r) {
        swal({ title: 'Webhook do WhatsApp', html: '<div id="webhook_conteudo">' + _htmlWebhook(r) + '</div>', width: 640, confirmButtonText: 'Fechar' });
    }).fail(function (x) {
        swal('Webhook do WhatsApp', (x.responseJSON && x.responseJSON.error) || 'Não foi possível conferir o webhook.', 'error');
    });
}

function _postWebhook(acao) {
    return $.ajax({
        url: '/api/whatsapp/webhook/', type: 'POST',
        data: { id_clinica: _idClinicaWebhook(), acao: acao },
        headers: { 'X-CSRFToken': (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '' },
    });
}

function AplicaWebhookWhatsapp() {
    $('#webhook_teste_resultado').text('Aplicando...');
    _postWebhook('aplicar').done(function (r) {
        $('#webhook_conteudo').html(_htmlWebhook(r));
        $('#webhook_teste_resultado').html(r.confere ? '<span style="color:#1e7e4a;">Webhook aplicado no servidor.</span>'
            : '<span style="color:#a93226;">O servidor aceitou, mas a conferência ainda não bate.</span>');
    }).fail(function (x) {
        $('#webhook_teste_resultado').html('<span style="color:#a93226;">' + _escWebhook((x.responseJSON && x.responseJSON.error) || 'Falhou.') + '</span>');
    });
}

function TestaWebhookWhatsapp() {
    $('#webhook_teste_resultado').text('Testando...');
    _postWebhook('testar').done(function (r) {
        $('#webhook_teste_resultado').html(r.success
            ? '<span style="color:#1e7e4a;">O endereço respondeu (HTTP ' + r.http + '). Se o servidor do WhatsApp alcança este mesmo endereço, as respostas chegam.</span>'
            : '<span style="color:#a93226;">O endereço ' + _escWebhook(r.url) + ' não respondeu como esperado: ' +
              _escWebhook(r.error || ('HTTP ' + r.http + ' ' + JSON.stringify(r.resposta || ''))) + '</span>');
    }).fail(function () {
        $('#webhook_teste_resultado').html('<span style="color:#a93226;">Falhou.</span>');
    });
}
