
let anamnese_alterado

$(".save_anamnese").on("paste input", function() {
    anamnese_alterado=true
});

$(".save_anamnese").blur( function() {
    if(anamnese_alterado) {
        anamnese_alterado=false
        SalvaAnamnese();
    }
});
$('.save_anamnese').on('select2:close', event =>  SalvaAnamnese());

function AddAnamnese() {
    $('.classAnamnese #id_queixa_principal').focus();
}

function CarregaAnamnese(id){
    $.ajax({
        url: '/prontuario/Anamnese/anamnese.json/',
        data: {'paciente': id},
        method: 'GET',
    }).success(function Ret(data) {
        if(data.success) {
            if(data.success.id) {
                $('#id_id_anamnese').val(data.success.id);
                for (var key in data.success.fields) {
                    if (data.success.fields.hasOwnProperty(key)) {
                        if (data.success.fields[key] === 'None') {
                            $('#' + key).val('');
                        }
                        else {
                            $('#' + key).val(data.success.fields[key]);
                        }
                    }
                }
                $('#data_anamnese').html(data.success.dataSalvo);
            }
            $('#id_ultima_anamnese').html(data.success.ultima);
        }
    });
}

function SalvaAnamnese(silent){
    $.ajax({
        url: '/prontuario/Anamnese/anamnese.json/',
        data: {
            'anamnese': $('#id_id_anamnese').val(),
            'form': $('#formAtendimento').serialize() + '&' + $('#formAnamnese').serialize()
        },
        method: 'PUT',
    }).success(function Ret(data){
        if (data.success && !silent){
             // a resposta traz o id e a data do registro salvo (não traz o paciente: recarregar
             // com data.success.paciente pedia a anamnese sem paciente e dava erro)
             $('#id_id_anamnese').val(data.success.id);
             $('#data_anamnese').html(data.success.dataSalvo);
             toastr.success('Dados Corretamente guardados no prontuario', 'Salvo com sucesso!');
        } else if (!silent){
             swal(String(data.error || 'Erro'), 'Problemas ao salvar!', 'error');
        }
    });
}