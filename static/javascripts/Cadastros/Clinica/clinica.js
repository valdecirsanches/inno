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
        ? 'Usa o servidor da Evolution API configurado no sistema; o endereço acima fica guardado para voltar ao WAHA.'
        : (disponivel ? '' : 'Evolution API não configurada no servidor.');
    $('#whatsapp_provedor_ajuda').text(ajuda);
    $('#id_whatsapp_url').prop('placeholder', whatsappProvedor === 'evolution' ? 'Não usado com a Evolution API' : 'http://192.168.0.10:3000');
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


