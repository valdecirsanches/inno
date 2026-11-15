
let exame_fisico_alterado

$(".save_exame_fisico").on("paste input", function() {
    exame_fisico_alterado=true
});

$(".save_exame_fisico").blur( function() {
    if(exame_fisico_alterado) {
        exame_fisico_alterado=false
        SalvaExameFisico();
    }
});
$('.save_exame_fisico').on('select2:close', event =>  SalvaExameFisico());


function CarregaExameFisico(id){
    $.ajax({
        url: '/prontuario/ExameFisico/CarregaExameFisico',
        data: {
            'exameFisico': id
        },
        method: 'GET',
    }).success(function Ret(data) {
        if(data.success) {
            $('#id_id_exame_fisico').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] == 'None') { $('#' + key).val(''); }
                    else { $('#' + key).val(data.success.fields[key]); }
                }
            }
        }
        $('#data_exame_fisico').html(data.success.dataSalvo);
    });
    
}

function SalvaExameFisico(silent){
    $.ajax({
        url: '/prontuario/ExameFisico/exame_fisico.json/',
        data: {
           'exameFisico': $('#id_id_exame_fisico').val(),
            'form': $('#formAtendimento').serialize() + '&' + $('#formExameFisico').serialize()
        },
        method: 'PUT',
    }).success(function Ret(data){
        if (data.success){
            $('#id_id_exame_fisico').val(data.success.id);
            $('#data_exame_fisico').html(data.success.dataSalvo);
            if(!silent) {toastr.success('Dados Corretamente guardados no prontuario', 'Salvo com sucesso!');}
        } else {
            if(!silent) {swal(data.error, 'Problemas ao salvar!', 'error');}
        }
    });
}

function CalculaIMC(){
    var altura = parseFloat(($('#id_altura').val()).replace(',','.')),
        peso = parseFloat(($('#id_peso').val()).replace(',','.'));
    if (altura && peso){
        var imc = (peso / Math.pow(altura, 2)).toFixed(6);
        $('#id_imc').val(imc);
    } else {
        $('#id_imc').val('');
    }
}