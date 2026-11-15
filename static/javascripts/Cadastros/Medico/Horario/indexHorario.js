class Horario extends MyObject {

    }

const horario = new Horario(
    'classHorario',
    (typeof $tableHorario !== 'undefined' ? $tableHorario : null),
    'medico/horario/'
);

function CreateHorario() {
    horario.clear();
}

async function ReadHorario(id) {
    await horario.index(id);
}

async function UpdateHorario() {
    await horario.submit();
}

function DeleteHorario(id_horario){
    swal({
        title: "Você tem certeza?",
        text: 'Esta ação apagará este horario.',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
        // closeOnConfirm: true
    }).then(async function () {
        await horario.delete(id_horario);
    });
}


$(window).load(function () {
    // ChamaPesquisaHorario();
});

$(".dial").knob();


