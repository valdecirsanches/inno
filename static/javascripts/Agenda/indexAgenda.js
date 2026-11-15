

class ObjAgenda extends MyObject {
}

const objagenda = new ObjAgenda(
    'classConsulta',
    (typeof $tableConsultas !== 'undefined' ? $tableConsultas : null),
    'agenda/'
);

function CreateAgenda() {
    objagenda.clear();
}

async function ReadAgenda(id) {
    await objagenda.index(id);
    $('a[href=#cadastro]').tab('show');
}

async function ShowAgenda(id) {
    await objagenda.index(id);
    var hora = '';
    if (objagenda.object.hora !== 'None') {
        hora = ' às ' + objagenda.object.hora_formatada;
    }
    $('#agenda-edit-title').html(
        `Consulta médica
            em ${objagenda.object.data_formatada} às ${objagenda.object.hora_formatada}
            <br> <span class="badge badge-info" style="font-size: x-large">com Dr(a) ${objagenda.object.fk_medico.nome}</span>
        `);
     $('.classConsulta #id_fk_paciente').select2('open');
    $('#modalConsulta').modal('show');
}


async function UpdateAgenda() {
    await objagenda.submit();
}


function DeleteAgenda(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará esta consulta do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
        // closeOnConfirm: true
    }).then(function () {
        objagenda.delete(id);
    });
}
