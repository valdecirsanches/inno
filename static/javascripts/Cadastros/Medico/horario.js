
function ExcluirHorario(id, periodo){
    $.ajax({
        url: '/cadastros/medicos/ExcluirHorario',
        data: {
           'id': id,
        },
        method: 'GET',
    }).success(function Ret(data){
        if(data.success){
            toastr.success('Horario excluido com exito!', 'Excluso');
            if (periodo === 'M'){
                DiaSemanaMatutino($("input[name='dia_semana']:checked").val(), $('#id_id').val());
            } else {
                DiaSemanaVespertino($("input[name='dia_semana']:checked").val(), $('#id_id').val());
            }
        } else {
            toastr.error('Horario não excluido!', 'Não excluso');
        }
    });
}

function FormatoExcluirHorario(value, row, index){
    return [
        '<a class="excluir ml10" title="Excluir Horário">',
            '<i class="fa fa-trash"></i>',
        '</a>'
    ].join('');
}

window.EventoExcluirHorario = {
    'click .excluir': function (e, value, row) {
        ExcluirHorario(row.id, row.periodo[1]);
    }
};

function rowStyle(row, index) {
    return {
        classes: row.periodo[0]
    }
}

$("input[name='dia_semana']").on("change", function(){
    DiaSemana($("input[name='dia_semana']:checked").val(), $('#id_id').val());
});

function DiaSemana(dia, id){
    //DiaSemanaMatutino(dia, id);
    //DiaSemanaVespertino(dia, id);
}

// function DiaSemanaMatutino(dia, id) {
//     $tableHorario.bootstrapTable('refresh', {query: {
//         periodo: 'M',
//         medico: id,
//         dia_semana: dia
//     }});
// }

// function DiaSemanaVespertino(dia, id){
//     $tableHorario.bootstrapTable('refresh', {query: {
//         periodo: 'T',
//         medico: id,
//         dia_semana: dia
//     }});
// }


/* Inicio BootstrapTable Matutino */
//var $tableHorariosMatutino = $('#tabelaHorariosMatutino');
/* Fim BootstrapTable Matutino */

/* Inicio BootstrapTable Vespertino */
//var $tableHorariosVespertino = $('#tabelaHorariosVespertino');
/* Fim BootstrapTable Vespertino */

function ConfHorarios(){
    $('#modalMedicoHorarios').modal('show');
}

function CriarHorarios(){
    $.ajax({
        url: '/cadastros/medicos/SalvarMedico',
        data: {
            'form': $('#formMedicoHorarios').serialize(true),
            'medico': $('#id_id').val()
        },
        method: 'GET',
    }).success(function Ret(data){
        if (data.success){
            toastr.success('Horários criados com sucesso!', data.success);
            $('#modalMedicoHorarios').modal('hide');
            DiaSemana($("input[name='dia_semana']:checked").val(), $('#id_id').val());
        }
    });
}

function LimparHorarios(){
    $.ajax({
        url: '/cadastros/medicos/LimparHorarios',
        data: {
            'medico': $('#id_id').val()
        },
        method: 'GET',
    }).success(function Rer(data){
        if (data.success){
            toastr.success('Horários limpos com sucesso!', data.success);
            DiaSemana($("input[name='dia_semana']:checked").val(), $('#id_id').val());
        }
    });
}
