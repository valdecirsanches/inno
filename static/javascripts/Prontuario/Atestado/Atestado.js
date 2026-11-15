
let atestado_alterado

$(".save_atestado").on("paste input", function() {
    atestado_alterado=true
});

$(".save_atestado").blur( function() {
    if(atestado_alterado) {
        atestado_alterado=false
        UpdateAtestado();
    }
});
$('.save_atestado').on('select2:close', event =>  UpdateAtestado());


var $tableAtestados = $('#tabelaAtestados');

async function CarregaAtestados(id_prontuario){
    await $tableAtestados.bootstrapTable('refresh', {query: {id_prontuario: id_prontuario}});
    const resp = await api.post('/atestado/get-ultimo-atestado/', {id_paciente: id_prontuario});
    if (resp.data.success) {
        $tableAtestados.bootstrapTable('checkBy', {field: 'id', values: [resp.data.success]});
        ReadAtestado(resp.data.success);
    }
}


$tableAtestados.on('click-row.bs.table', function (e, row) {
    ReadAtestado(row.id);
});

function OptionsAtestado(value, row, index) {
    return [
        '<div>',
        '<a class="edit btn btn-success btn-outline" href="javascript:void(0)" title="Editar">',
        '<i class="glyphicon glyphicon-edit"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="remove btn btn-success btn-outline" href="javascript:void(0)" title="Apagar">',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventsAtestado = {
    'click .edit': function (e, value, row, index) {
        ReadAtestado(row.id);
    },
    'click .remove': function (e, value, row, index) {
        DeleteAtestado(row.id);
    },
};


$('#id_para').on('change', function (event){
    $('#id_finalidade_div').addClass('hide');
    if (this.value==='O'){
        $('#id_finalidade_div').removeClass('hide');
        // $('#id_para_outra_finalidade').focus();
    }
});

$('#id_volta').on('change', function (event){
    $('#id_volta_c_div').addClass('hide');
    $('#id_volta_e_div').addClass('hide');
    if (this.value==='C'){
        $('#id_volta_c_div').removeClass('hide');
        // $('#id_afastado_por').focus();
    } else if (this.value==='E2'){
        $('#id_volta_e_div').removeClass('hide');
        // $('#id_comparecer_em').focus();
    }
});

function CarregaAtestado(id){
    atestado.index(id);
    $('#id_finalidade_div').addClass('hide');
    if (atestado.object.ir_para==='O'){
        $('#id_finalidade_div').removeClass('hide');
    }
    $('#id_volta_c_div').addClass('hide');
    $('#id_volta_e_div').addClass('hide');
    if (atestado.object.volta==='C'){
        $('#id_volta_c_div').removeClass('hide');
    } else if (atestado.object.volta==='E2') {
        $('#id_volta_e_div').removeClass('hide');
    }
    $('#id_emissor').html('Salvo em: '+atestado.object.dataSalvo+' por '+atestado.object.fk_usuario.first_name);
}



async function ImprimeAtestado(){
    await UpdateAtestado(true);
    printPDF(`ImprimeAtestado?id_consulta=${atestado.object.fk_consulta.id}&id_atestado=${atestado.object.id}`);
}


function horaSaida(){
    var hora = new Date();
    hora = [strzero(hora.getHours(),2), strzero(hora.getMinutes(),2)].join(':');
    $('#id_hora_saida').val(hora);
}
