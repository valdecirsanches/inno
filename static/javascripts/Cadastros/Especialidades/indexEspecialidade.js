
class Especialidade extends MyObject {
    clear() {
        super.clear();

    }

    async index(id) {
        await super.index(id);
    }
}

const especialidade = new Especialidade(
    'classEspecialidade',
    (typeof $tableEspecialidade !== 'undefined' ? $tableEspecialidade : null),
    'especialidade/'
);

function CreateEspecialidade() {
    especialidade.clear();
}

async function ReadEspecialidade(id) {
    await especialidade.index(id);
    $('a[href=#cadastro]').tab('show');
}

async function UpdateEspecialidade() {
    await especialidade.submit();
}



function DeleteEspecialidade(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará esta especialidade do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
        // closeOnConfirm: true
    }).then(function () {
        especialidade.delete(id);
    });
}
