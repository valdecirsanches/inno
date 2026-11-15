

var $tableHorario = $('#tabelaHorario');
// var $tableHorariosVespertino = $('#tabelaHorariosVespertino');
//
// function ExcluirHorario(id, periodo){
//     $.ajax({
//         url: '/cadastros/medicos/ExcluirHorario',
//         data: {
//            'id': id,
//         },
//         method: 'GET',
//     }).success(function Ret(data){
//         if(data.success){
//             toastr.success('Horario excluido com exito!', 'Excluso');
//             if (periodo === 'M'){
//                 DiaSemanaMatutino($("input[name='dia_semana']:checked").val(), $('#id_id').val());
//             } else {
//                 DiaSemanaVespertino($("input[name='dia_semana']:checked").val(), $('#id_id').val());
//             }
//         } else {
//             toastr.error('Horario não excluido!', 'Não excluso');
//         }
//     });
// }

function FormatoExcluirHorario(value, row, index){
    return [
        '<a class="excluir ml10" title="Excluir Horário">',
            '<i class="fa fa-trash"></i>',
        '</a>'
    ].join('');
}

window.EventoExcluirHorario = {
    'click .excluir': function (e, value, row) {
        DeleteHorario(row.id);
    }
};

function rowStyleHorario(row, index) {
    return {
        classes: $(".periodo:checked").val()
    };
}

$("input[name='dia_semana']").on("change", function(e){
    $tableHorario.bootstrapTable('refresh', {
        query: {
            fk_medico: medico.object.id || 0,
            dia_semana: e.target.value,
            periodo: $(".periodo:checked").val(),
        }
    });
});

$(".periodo").on("change", function(e){
    $tableHorario.bootstrapTable('refresh', {
        query: {
            fk_medico: medico.object.id || 0,
            dia_semana: $(".dia_semana:checked").val(),
            periodo: e.target.value,
        }
    });
});

//
function DiaSemana(dia, id){
    //DiaSemanaMatutino(dia, id);
    //DiaSemanaVespertino(dia, id);
}

// function DiaSemanaMatutino(dia, id) {
//     $tableHorariosMatutino.bootstrapTable('refresh', {query: {
//         periodo: 'M',
//         medico: id,
//         dia_semana: dia
//     }});
// }
// function DiaSemanaVespertino(dia, id){
//     $tableHorariosVespertino.bootstrapTable('refresh', {query: {
//         periodo: 'T',
//         medico: id,
//         dia_semana: dia
//     }});
// }


/* Inicio BootstrapTable Matutino */

/* Fim BootstrapTable Matutino */

/* Inicio BootstrapTable Vespertino */

/* Fim BootstrapTable Vespertino */
//
function ConfHorarios(){
    $('#modalMedicoHorarios').modal('show');
}

//
async function CriarHorarios(){
    const resp = await api.post('/medico/horario/cria-horarios/', {dia_semana: $("input[name='dia_semana']:checked").val(), medico: $('#id_id').val(), form: $('#formMedicoHorarios').serialize(true)})
    if (resp.data.success){
        toastr.success('Horários criados com sucesso!', resp.data.success);
        $('#modalMedicoHorarios').modal('hide');
        $tableHorario.bootstrapTable('refresh', {
            query: {
                fk_medico: $('#id_id').val() || 0,
                dia_semana: $("input[name='dia_semana']:checked").val(),
                periodo: $(".periodo:checked").val(),
            }
        });
    } else {
        toastr.error('Erro ao criar horários!', 'Erro');
    }
}

async function LimparHorarios(){
    const resp = await api.post('/medico/horario/limpa-horarios/', {dia_semana: $("input[name='dia_semana']:checked").val(), medico: $('#id_id').val()})
    if (resp.data.success){
        toastr.success('Horários criados com sucesso!', resp.data.success);
        // $('#modalMedicoHorarios').modal('hide');
        $tableHorario.bootstrapTable('refresh', {
            query: {
                fk_medico: $('#id_id').val() || 0,
                dia_semana: $("input[name='dia_semana']:checked").val(),
                // periodo: $(".periodo:checked").val(),
            }
        });
    } else {
        toastr.error('Erro ao criar horários!', 'Erro');
    }
    // $.ajax({
    //     url: '/cadastros/medicos/LimparHorarios',
    //     data: {
    //         'medico': $('#id_id').val()
    //     },
    //     method: 'GET',
    // }).success(function Rer(data){
    //     if (data.success){
    //         toastr.success('Horários limpos com sucesso!', data.success);
    //         DiaSemana($("input[name='dia_semana']:checked").val(), $('#id_id').val());
    //     }
    // });
}
